/**
 * 退出清理 —— 程序关掉时把注入会话收干净。
 *
 * 关窗口、点托盘退出、任务管理器结束、Ctrl+C，最后都要走到这里：
 *
 *   停注入（停 patcher → 撤掉本次导入 → 把用户的模组开回去 → 关掉本程序启动的
 *   LTK Manager）→ 断开 LCU → 停语言监听。
 *
 * 整段有硬超时。桥不响应时不能让「关程序」变成「关不掉」：超时就直接结束
 * LTK Manager 进程，没删掉的模组记在 ltf_session.json 里，下次启动再清
 * （见 ltfSession.ts 的 sweepPrevious）。
 */

import { lcuConnector } from '../http/lcuConnector';
import { gameflowMonitor } from '../http/gameflowMonitor';
import { killLeftoverManagerSync, ltfInjector } from './ltfSession';
import { stopLocaleWatcher } from './locale-watcher';

/** 退出清理最多等这么久；超时说明桥出了问题，直接强杀 */
const SHUTDOWN_TIMEOUT_MS = 15000;

let running: Promise<void> | null = null;
let finished = false;

/** 清理是否已经做完（关窗口 / before-quit 用它判断能不能真的退） */
export const isShutdownFinished = (): boolean => finished;

/**
 * 收尾，只会跑一次：重复调用拿到的是同一个 Promise。
 *
 * 调用方拿到 Promise 之后必须真的退出程序 —— 这里只负责清理。
 */
export const shutdown = (): Promise<void> => {
  if (!running) {
    running = runShutdown();
  }
  return running;
};

const runShutdown = async (): Promise<void> => {
  try {
    await withTimeout(ltfInjector.shutdown(), SHUTDOWN_TIMEOUT_MS);
  } catch (error) {
    console.warn('[EXIT] 停止注入超时或失败:', error);
    // 桥可能已经不响应了：按记录里的 pid 直接结束我们启动的 LTK Manager
    killLeftoverManagerSync();
  } finally {
    finished = true;
    try {
      lcuConnector?.disconnect();
    } catch (error) {
      console.warn('[EXIT] 断开 LCU 失败:', error);
    }
    try {
      gameflowMonitor?.stop();
    } catch (error) {
      console.warn('[EXIT] 停止 gameflow 监听失败:', error);
    }
    try {
      stopLocaleWatcher();
    } catch (error) {
      console.warn('[EXIT] 停止语言监听失败:', error);
    }
  }
};

/** 给清理加个上限：超时抛错，让调用方走强杀 */
const withTimeout = (task: Promise<unknown>, timeoutMs: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      reject(new Error(`清理超过 ${Math.round(timeoutMs / 1000)} 秒`));
    }, timeoutMs);
    const settle = (error?: unknown) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    task.then(
      () => settle(),
      (error) => settle(error)
    );
  });
