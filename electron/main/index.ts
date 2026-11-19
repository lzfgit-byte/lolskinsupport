import { join } from 'node:path';
import { BrowserWindow, app } from 'electron';
import useIpcMain from '../hooks/use-ipc-main';
import useCookie from '../hooks/use-cookie';
import useGlobalShortcut from '../hooks/use-global-shortcut';
import './init/init-env';
import 'reflect-metadata';
import { resolvePreload, resolvePublic } from '../utils/KitUtil';
import { LogMsgUtil, MessageUtil, useGlobalMessage } from '../utils/message';
import { initLcu } from '../http/connect-league-legends';
import { lcuConnector } from '../http/lcuConnector';
import { gameflowMonitor } from '../http/gameflowMonitor';
import { initLocaleWatcher, stopLocaleWatcher } from '../export/locale-watcher';
import { killLeftoverManagerSync } from '../export/ltfSession';
import { ensureToolsConfigured } from '../export/tools-env';
import { isShutdownFinished, shutdown } from '../export/shutdown';
import { startSkinSyncMonitor } from '../export/skin-sync';
// 启动服务
let win: BrowserWindow | null = null;
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = join(process.env.DIST, 'index.html');
let execFuncOnClose = [];
/** 退出清理做完了，窗口可以真的关掉 */
let closeAllowed = false;
/** 退出流程只跑一次（关窗口和 before-quit 会同时进来） */
let quitting = false;

/**
 * 关窗口 / 退出程序都走这里：先把注入收干净再真退。
 *
 * 注入会话跑在 LTK Manager 里，主进程一退它就没人管了 —— 所以必须等
 * `shutdown()`（停 patcher、撤掉本次导入、关掉本程序启动的 LTK Manager）
 * 做完才销毁窗口。清理本身有硬超时，不会把程序卡死。
 */
async function quitAfterCleanup(): Promise<void> {
  if (quitting) {
    return;
  }
  quitting = true;
  MessageUtil.info('正在停止注入并关闭 LTK Manager…');
  try {
    await shutdown();
  } catch (error) {
    console.warn('[EXIT] 退出清理失败:', error);
  }
  closeAllowed = true;
  if (win && !win.isDestroyed()) {
    // destroy：不再触发 close，避免又进一次退出流程
    win.destroy();
  }
  app.quit();
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'ghs',
    width: 1400,
    height: 788,
    icon: resolvePublic('favicon.ico'),
    webPreferences: {
      preload: resolvePreload('index'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.on('close', (event) => {
    if (closeAllowed) {
      return;
    }
    // 用户点 X：先清理再关，否则 LTK Manager 和 patcher 会留在后台
    event.preventDefault();
    void quitAfterCleanup();
  });
  useGlobalShortcut(win);
  useGlobalMessage(win);
  initLcu(win);
  // 打开软件即自动启用语言监听
  initLocaleWatcher();
  // useHtmlGetWin(win);
  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(url);
    win.webContents.openDevTools();
  } else {
    await win.loadFile(indexHtml);
  }
  win.addListener('closed', () => {
    execFuncOnClose.forEach((func) => {
      func && func();
    });
    stopLocaleWatcher();
    lcuConnector?.disconnect();
    gameflowMonitor?.stop();
  });
}

app.whenReady().then(async () => {
  // 工具随安装包放在 resources\tools：把配置里的 MOD_TOOLS_PATH 指过去（旧路径自动迁移）
  try {
    const tools = ensureToolsConfigured();
    if (tools.changed) {
      console.log(`[TOOLS] MOD_TOOLS_PATH -> ${tools.path}`);
    }
  } catch (error) {
    console.warn('[TOOLS] 对齐工具路径失败:', error);
  }
  await createWindow();
  // 皮肤自动同步：按设置定时检查 LeagueSkins 清单，有变化就下载
  startSkinSyncMonitor();
});
/**
 *窗口跟app是不一样的，这说明可以在无窗口时，可以再次创建窗口
 */
app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
/**
 * 退出前先收尾：窗口已经关掉（比如被系统关掉）时也不能直接退出，
 * 否则 LTK Manager 会一直挂在托盘里。
 */
app.on('before-quit', (event) => {
  if (closeAllowed || isShutdownFinished()) {
    return;
  }
  event.preventDefault();
  void quitAfterCleanup();
});
/**
 *两个实例，想要再次隐形
 */
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) {
      // 重新恢复
      win.restore();
    }
    win.focus();
  }
});
/**
 * 在应用变为活动时触发，展示第一个窗口
 */
app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// Ctrl+C / 被要求结束时也先清理（开发时最常见）
const quitOnSignal = (signal: string) => {
  LogMsgUtil.sendLogMsg(`[EXIT] 收到 ${signal}，先清理注入`);
  void quitAfterCleanup().finally(() => {
    app.exit(0);
  });
};
process.on('SIGINT', () => quitOnSignal('SIGINT'));
process.on('SIGTERM', () => quitOnSignal('SIGTERM'));
/**
 * 最后一道保险：走到 process.exit / app.exit 而清理没做完时，
 * 同步结束本程序启动的 LTK Manager（spawnSync 才来得及）。
 */
process.on('exit', () => {
  if (!isShutdownFinished()) {
    killLeftoverManagerSync();
  }
});

// 注册远程方法
useIpcMain();
useCookie();
export const getMainWin = (): BrowserWindow => win;
