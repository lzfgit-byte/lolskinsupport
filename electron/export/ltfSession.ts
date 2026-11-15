/**
 * LTF 注入会话 —— 按 Rose 1.5 的方式驱动 LTK Manager 完成换肤。
 *
 * 流程：
 *   1. ltk_launcher.exe 以隐藏方式启动 LTK Manager，并注入 LeagueToolFlop.dll；
 *   2. 通过桥把皮肤压缩包「原样」装进 LTK Manager 的模组库（不再走
 *      mod-tools.exe import / mkoverlay，也不再需要用户自备 ltk_patcher_host.exe）；
 *   3. 只启用本次要用的皮肤，把用户自己在 LTK Manager 里启用的模组临时关掉，
 *      这样 overlay 里只有我们选的皮肤；
 *   4. 让 LTK Manager 启动它自己的 patcher —— 由它构建 overlay、扫描游戏进程；
 *   5. 结束时停 patcher、删掉本次导入、把用户的模组开回去；只关闭自己启动的
 *      LTK Manager，用户手动打开的那个不碰；
 *   6. 程序退出走 shutdown()：和上面一样收尾，但有硬超时 —— 桥不响应就直接结束
 *      LTK Manager，没删掉的条目记进 ltf_session.json，下次启动补清。
 *
 * LTK Manager 按内容给模组去重：同一份皮肤再导入一次会回 alreadyInstalled，
 * 并把已有条目放在 `response.value.mod` 里。那种条目是用户自己的，结束时只恢复
 * 它原来的开关状态，不能删。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import {
  BridgeCommandError,
  BridgeUnavailable,
  type LibraryEntry,
  LtkBridge,
  findBridge,
} from './ltfBridge';

// ==================== 常量 ====================

export const LTF_LAUNCHER = 'ltk_launcher.exe';
export const LTF_BRIDGE_DLL = 'LeagueToolFlop.dll';

const LTK_MANAGER_EXECUTABLES = ['ltk-manager.exe', 'LTK Manager.exe'];
const LTK_MANAGER_DIR_NAME = 'LTK Manager';

/** ltk_launcher.exe 的退出码（native/ltf/LeagueToolFlop-inj.cpp） */
const LauncherExit = {
  OK: 0,
  DLL_MISSING: 1,
  EXE_MISSING: 2,
  SPAWN_FAILED: 3,
  INJECT_FAILED: 4,
  ALREADY_RUNNING: 5,
  NO_LIVE_INSTANCE: 6,
} as const;

const LAUNCHER_TIMEOUT_MS = 60000;
const BRIDGE_START_TIMEOUT_MS = 30000;
const CDP_READY_TIMEOUT_MS = 20000;
const CDP_READY_POLL_MS = 500;
const PATCHER_STOP_WAIT_MS = 20000;
const PATCHER_STOP_POLL_MS = 400;
const MANAGER_EXIT_GRACE_MS = 3000;
/** 退出清理的总预算：超时就直接结束 LTK Manager，不能让程序关不掉 */
const SHUTDOWN_DEADLINE_MS = 15000;
/** 退出清理时给管理器的退出时间（正常情况 3 秒够了） */
const SHUTDOWN_MANAGER_GRACE_MS = 1500;
/** 桥命令的默认超时（与 ltfBridge 的 DEFAULT_TIMEOUT_MS 对齐） */
const BRIDGE_COMMAND_TIMEOUT_MS = 60000;

const ALREADY_OPEN_REASON =
  'LTK Manager 已经开着，但它里面没有 Rose 的桥。请先把它关掉（托盘里也要退出）再试';

// ==================== 路径 ====================

/** LTF 桥所在的目录：打包后在 resources/ltf，开发时在 native/ltf/build */
export const resolveLtfDir = (): string => {
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, 'ltf') : '';
  // 打包后 process.defaultApp 不存在；vite dev 里 electron 以 . 启动，它是 true
  if (!process.defaultApp && packaged && fs.existsSync(path.join(packaged, LTF_LAUNCHER))) {
    return packaged;
  }
  const dev = path.join(process.cwd(), 'native', 'ltf', 'build');
  if (fs.existsSync(path.join(dev, LTF_LAUNCHER))) {
    return dev;
  }
  return packaged || dev;
};

const resolveLauncher = (): string | null => {
  const dir = resolveLtfDir();
  const launcher = path.join(dir, LTF_LAUNCHER);
  const dll = path.join(dir, LTF_BRIDGE_DLL);
  return fs.existsSync(launcher) && fs.existsSync(dll) ? launcher : null;
};

/** 读取配置里的 LTK Manager 路径（键 LTK_MANAGER_PATH） */
const configuredLtkManager = (): string | null => {
  try {
    const raw = fs.readFileSync(path.join(userDataDir(), 'config.json'), 'utf-8');
    const configured = `${JSON.parse(raw)?.LTK_MANAGER_PATH ?? ''}`.trim().replace(/^"|"$/g, '');
    if (configured && fs.existsSync(configured)) {
      return configured;
    }
  } catch {
    // 没有配置或配置读不了，走自动探测
  }
  return null;
};

const ltkManagerInstallDirs = (): string[] => {
  const bases = [
    process.env.ProgramW6432,
    process.env.ProgramFiles,
    process.env.LOCALAPPDATA,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : undefined,
  ];
  const dirs: string[] = [];
  for (const base of bases) {
    if (!base) {
      continue;
    }
    const candidate = path.join(base, LTK_MANAGER_DIR_NAME);
    if (!dirs.includes(candidate)) {
      dirs.push(candidate);
    }
  }
  return dirs;
};

/** ltk-manager.exe：配置 > 已知安装位置 */
const resolveLtkManager = (): string | null => {
  const configured = configuredLtkManager();
  if (configured) {
    return configured;
  }
  for (const dir of ltkManagerInstallDirs()) {
    for (const name of LTK_MANAGER_EXECUTABLES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
};

/** 本程序的数据目录，与 electron/const 里的 tempPath 一致 */
const userDataDir = (): string => path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'lol-skin-ll');

const stagingDir = (): string => path.join(userDataDir(), 'ltf_staging');
const sessionStatePath = (): string => path.join(userDataDir(), 'ltf_session.json');
const ltkLogsDir = (): string => path.join(userDataDir(), 'logs', 'ltk');

// ==================== 进程小工具 ====================

const runTasklist = (filter: string): Promise<string> =>
  new Promise((resolve) => {
    execFile('tasklist', ['/FI', filter, '/NH'], { windowsHide: true }, (error, stdout) => {
      resolve(error ? '' : stdout || '');
    });
  });

/** 有没有 ltk-manager.exe 在跑（桥只认得 launcher 启动的那个） */
const isLtkManagerRunning = async (): Promise<boolean> => {
  for (const name of LTK_MANAGER_EXECUTABLES) {
    const output = await runTasklist(`IMAGENAME eq ${name}`);
    if (output.toLowerCase().includes(name.toLowerCase())) {
      return true;
    }
  }
  return false;
};

const isPidRunning = async (pid: number | null): Promise<boolean> => {
  if (!pid) {
    return false;
  }
  const output = await runTasklist(`PID eq ${pid}`);
  return output.includes(`${pid}`);
};

/** 只在 pid 真的是 LTK Manager 时结束它，避免 pid 被复用时误杀 */
const killManagerPid = async (pid: number | null): Promise<void> => {
  if (!pid) {
    return;
  }
  const output = await runTasklist(`PID eq ${pid}`);
  if (!output.toLowerCase().includes('ltk-manager')) {
    return;
  }
  await new Promise<void>((resolve) => {
    execFile('taskkill', ['/PID', `${pid}`, '/T', '/F'], { windowsHide: true }, () => resolve());
  });
  LogMsgUtil.sendLogMsg(`[LTF] 已关闭 Rose 启动的 LTK Manager（PID ${pid}）`);
};

const waitPidGone = async (pid: number | null, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPidRunning(pid))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};

/**
 * 让 LTK Manager 退出：先请它自己退（桥的 kill），等不到就走 taskkill。
 * 只对 *pid* 真的是 ltk-manager.exe 时才动手（killManagerPid 会再校验一次）。
 */
const closeManager = async (
  bridge: LtkBridge | null,
  pid: number | null,
  graceMs = MANAGER_EXIT_GRACE_MS
): Promise<void> => {
  if (bridge) {
    try {
      await bridge.kill();
    } catch {
      // 应答可能回不来
    }
  }
  await waitPidGone(pid, graceMs);
  if (await isPidRunning(pid)) {
    await killManagerPid(pid);
  }
};

// ==================== 收尾预算 ====================

/**
 * 一次收尾能花多少时间。用户手动「停止注入」时可以慢慢等（Infinity），
 * 程序退出时必须有上限：桥不响应也要先把 LTK Manager 关掉再退。
 */
interface Budget {
  deadline: number;
}

const UNLIMITED: Budget = { deadline: Number.POSITIVE_INFINITY };

const budgetLeft = (budget: Budget): number => budget.deadline - Date.now();

const budgetExpired = (budget: Budget): boolean => budgetLeft(budget) <= 0;

/** 单条桥命令的超时：不超过预算剩下的时间，再少也得给 1.5 秒把命令发出去 */
const budgetTimeout = (budget: Budget, fallback = BRIDGE_COMMAND_TIMEOUT_MS): number =>
  Number.isFinite(budget.deadline)
    ? Math.max(1500, Math.min(fallback, budgetLeft(budget)))
    : fallback;

// ==================== 会话状态 ====================

/** 一次会话导入的条目：LTK Manager 新建的会在结束时删掉，复用的只恢复开关 */
interface TrackedImport {
  id: string;
  /** true = 本次导入新建的；false = LTK Manager 库里已有（同内容），是用户自己的 */
  created: boolean;
  /** 复用条目的原始开关状态 */
  wasEnabled: boolean;
}

interface SessionState {
  managerPid: number | null;
  startedByUs: boolean;
  imports: TrackedImport[];
  disabled: string[];
}

interface Session extends SessionState {
  bridge: LtkBridge;
  patcherRunning: boolean;
}

const readSessionState = (): SessionState | null => {
  try {
    const raw = JSON.parse(fs.readFileSync(sessionStatePath(), 'utf-8'));
    const imports: TrackedImport[] = Array.isArray(raw?.imports)
      ? raw.imports
          .map((item: unknown) =>
            typeof item === 'string'
              ? { id: item, created: true, wasEnabled: false }
              : item && typeof item === 'object' && 'id' in item
              ? {
                  id: String((item as TrackedImport).id),
                  created: (item as TrackedImport).created !== false,
                  wasEnabled: (item as TrackedImport).wasEnabled === true,
                }
              : null
          )
          .filter((item): item is TrackedImport => !!item)
      : [];
    return {
      managerPid: typeof raw?.managerPid === 'number' ? raw.managerPid : null,
      startedByUs: !!raw?.startedByUs,
      imports,
      disabled: Array.isArray(raw?.disabled) ? raw.disabled.map(String) : [],
    };
  } catch {
    return null;
  }
};

const writeSessionState = (state: SessionState): void => {
  try {
    const target = sessionStatePath();
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(temp, target);
  } catch (error) {
    console.warn('[LTF] 无法保存会话状态:', error);
  }
};

const clearSessionState = (): void => {
  try {
    fs.rmSync(sessionStatePath(), { force: true });
  } catch {
    // 删不掉就算了，下次启动还会再清一遍
  }
};

/**
 * 把还没收尾的部分记下来：这次没删掉的导入、没开回去的模组。
 *
 * LTK Manager 的模组库是它自己的持久化数据，管理器关了条目还在 —— 只有等
 * 下次启动、桥可用时才能删。记下来，下次 `sweepPrevious()` 接着清。
 */
const persistLeftovers = (state: SessionState): void => {
  writeSessionState({
    managerPid: state.managerPid,
    startedByUs: state.startedByUs,
    imports: state.imports,
    disabled: state.disabled,
  });
};

// ==================== 注入器 ====================

export interface SkinArchive {
  /** 皮肤压缩包（.zip / .fantome）的完整路径 */
  archive: string;
  heroId: string;
  skinId: string;
}

const errText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class LtfInjector {
  private session: Session | null = null;
  private applying = false;
  /** 程序正在退出：不再接受新的注入 */
  private shuttingDown = false;

  /** 注入是否在跑（patcher 已经启动） */
  isRunning(): boolean {
    return !!this.session?.patcherRunning;
  }

  isApplying(): boolean {
    return this.applying;
  }

  /**
   * 应用一批皮肤：导入 LTK Manager、只启用这些、关掉用户自己的模组，然后启动 patcher。
   *
   * 同一时间只有一个会话：换皮肤会先把上一次导入的皮肤撤掉。
   */
  async applySkins(skins: SkinArchive[]): Promise<{ ok: boolean; error?: string }> {
    if (skins.length === 0) {
      return { ok: false, error: '没有要注入的皮肤' };
    }
    if (this.applying) {
      return { ok: false, error: '正在应用另一个皮肤，请稍候' };
    }
    if (this.shuttingDown) {
      return { ok: false, error: '程序正在退出，不再注入' };
    }
    this.applying = true;
    let session: Session | null = null;
    try {
      session = await this.ensureSession();
      // 换皮肤：先把上一次的导入撤掉，再装这一批
      if (session.imports.length > 0) {
        await this.stopPatcher(session);
        await this.dropImports(session);
      }

      for (const skin of skins) {
        const staged = await this.stageArchive(skin);
        const tracked = await this.importOne(
          session.bridge,
          staged,
          `${skin.heroId}_${skin.skinId}`
        );
        session.imports.push(tracked);
        await session.bridge.toggle(tracked.id, true);
      }

      await this.disableOtherMods(session);
      await this.startPatcher(session);
      session.patcherRunning = true;
      writeSessionState(session);
      return { ok: true };
    } catch (error) {
      const message = errText(error);
      if (!this.shuttingDown) {
        MessageUtil.error(`注入失败：${message}`);
      }
      if (session) {
        await this.endSession(session, false);
      }
      return { ok: false, error: message };
    } finally {
      this.applying = false;
    }
  }

  /** 停止注入并收拾干净：停 patcher、删掉本次导入、把用户的模组开回去 */
  async stop(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (!session) {
      await this.recoverLeftovers();
      return;
    }
    await this.endSession(session, true);
  }

  /**
   * 程序退出时的收尾：做和 stop() 一样的事，但每一步都有时间预算。
   *
   * 程序关掉后 LTK Manager / patcher 不能留着 —— 桥要是没应答，就按记录里的
   * pid 直接结束它；库里没来得及删的条目记在 ltf_session.json，下次启动再删。
   */
  async shutdown(deadlineMs = SHUTDOWN_DEADLINE_MS): Promise<void> {
    this.shuttingDown = true;
    const session = this.session;
    this.session = null;
    const budget: Budget = { deadline: Date.now() + deadlineMs };
    try {
      if (session) {
        await this.endSession(session, false, budget);
        await this.forceCloseManager(session);
      } else {
        await this.recoverLeftovers(budget);
      }
    } catch (error) {
      console.warn('[LTF] 退出清理失败:', error);
      if (session) {
        await this.forceCloseManager(session);
      }
    }
  }

  /** 兜底：本该关掉的 LTK Manager 还活着，就直接结束进程 */
  private async forceCloseManager(session: Session): Promise<void> {
    if (!session.startedByUs || !session.managerPid) {
      return;
    }
    if (!(await isPidRunning(session.managerPid))) {
      return;
    }
    await killManagerPid(session.managerPid);
  }

  /** 异常退出残留的清理：把上次没撤掉的导入删掉、把用户模组开回去 */
  async recoverLeftovers(budget: Budget = UNLIMITED): Promise<void> {
    const state = readSessionState();
    if (!state) {
      return;
    }
    let found: Awaited<ReturnType<typeof findBridge>> = null;
    try {
      found = await findBridge();
    } catch (error) {
      console.warn('[LTF] 找不到桥:', error);
    }
    if (!found) {
      // 管理器已经关了，库里的条目只能等下次启动、有桥之后再删
      if (state.startedByUs) {
        await killManagerPid(state.managerPid);
      }
      persistLeftovers(state);
      return;
    }

    const bridge = new LtkBridge(found.port, (found.hello.pid as number) ?? null);
    try {
      if (await this.patcherIsRunning(bridge)) {
        await this.stopPatcherOn(bridge, budget);
      }
      const leftover = await this.dropRecorded(bridge, state, budget);
      if (leftover) {
        persistLeftovers(leftover);
        LogMsgUtil.sendLogMsg('[LTF] 上次注入还有模组没撤掉，已记下来下次再清');
      } else {
        clearSessionState();
        LogMsgUtil.sendLogMsg('[LTF] 已清理上一次注入留下的模组');
      }
    } catch (error) {
      console.warn('[LTF] 清理残留失败:', error);
      persistLeftovers(state);
    }
    if (state.startedByUs) {
      const graceMs = Number.isFinite(budget.deadline)
        ? SHUTDOWN_MANAGER_GRACE_MS
        : MANAGER_EXIT_GRACE_MS;
      await closeManager(bridge, state.managerPid ?? bridge.pid, graceMs);
    }
  }

  // ---- 会话建立 -------------------------------------------------------

  private async ensureSession(): Promise<Session> {
    if (this.session && (await this.session.bridge.alive())) {
      return this.session;
    }
    this.session = null;

    if (this.shuttingDown) {
      throw new Error('程序正在退出，不再注入');
    }

    // 上一次注入留下的记录：拿到桥之后再清 —— 没有桥就删不掉 LTK 库里的模组
    const previous = readSessionState();

    const existing = await findBridge();
    if (existing) {
      const pid = (existing.hello.pid as number) ?? null;
      const startedByUs = !!previous?.startedByUs && previous.managerPid === pid;
      const session: Session = {
        bridge: new LtkBridge(existing.port, pid),
        managerPid: pid,
        startedByUs,
        imports: [],
        disabled: [],
        patcherRunning: false,
      };
      LogMsgUtil.sendLogMsg(
        `[LTF] 复用已运行的 LTK Manager（桥端口 ${existing.port}${
          startedByUs ? '，由本程序启动' : ''
        }）`
      );
      await this.healthCheckOff(session.bridge);
      await this.sweepPrevious(previous, session);
      writeSessionState(session);
      this.session = session;
      return session;
    }

    if (await isLtkManagerRunning()) {
      throw new Error(ALREADY_OPEN_REASON);
    }

    const launcher = resolveLauncher();
    if (!launcher) {
      throw new Error(
        `缺少 ${LTF_LAUNCHER} / ${LTF_BRIDGE_DLL}（应在 ${resolveLtfDir()}）。` +
          '请先运行 npm run ltf:build 生成，或重新安装本程序'
      );
    }
    const manager = resolveLtkManager();
    if (!manager) {
      throw new Error(
        '没有找到 LTK Manager（ltk-manager.exe）。请先安装 LTK Manager，' +
          '或在 config.json 里设置 LTK_MANAGER_PATH 指向它'
      );
    }

    LogMsgUtil.sendLogMsg(`[LTF] 通过 ${path.basename(launcher)} 启动 LTK Manager: ${manager}`);
    const logDir = ltkLogsDir();
    try {
      await fsp.mkdir(logDir, { recursive: true });
    } catch {
      // 日志目录建不出来不影响注入
    }

    const launched = await this.runLauncher(launcher, manager, logDir);
    if (launched.exitCode === LauncherExit.ALREADY_RUNNING) {
      throw new Error(ALREADY_OPEN_REASON);
    }
    if (launched.exitCode !== LauncherExit.OK) {
      throw new Error(`ltk_launcher 启动失败（退出码 ${launched.exitCode}）`);
    }

    let bridge: LtkBridge;
    try {
      bridge = await LtkBridge.waitForBridge(BRIDGE_START_TIMEOUT_MS, launched.pid ?? undefined);
    } catch (error) {
      await killManagerPid(launched.pid);
      throw new Error(`LTF 桥没有起来：${errText(error)}`);
    }
    const session: Session = {
      bridge,
      managerPid: bridge.pid ?? launched.pid,
      startedByUs: true,
      imports: [],
      disabled: [],
      patcherRunning: false,
    };
    // 先把管理器的 pid 记下来：启动途中崩溃的话，下次也知道该关哪个进程
    writeSessionState(
      previous ? { ...session, imports: previous.imports, disabled: previous.disabled } : session
    );
    // 上一次会话的暂存包：LTK Manager 已经装进自己的库了
    await fsp.rm(stagingDir(), { recursive: true, force: true });
    await this.waitForCdp(bridge);
    await this.healthCheckOff(bridge);
    await this.sweepPrevious(previous, session);
    writeSessionState(session);
    this.session = session;
    return session;
  }

  /**
   * 清掉上一次会话留下的记录。
   *
   * 只有拿到桥之后才能做：模组库存在 LTK Manager 里，管理器已经关了的时候
   * 只能等下次启动。清不掉的（预算用完 / 命令失败）继续记着，下次再试。
   */
  private async sweepPrevious(previous: SessionState | null, session: Session): Promise<void> {
    if (!previous) {
      return;
    }
    if (previous.startedByUs && previous.managerPid && previous.managerPid !== session.managerPid) {
      // 上次那个管理器已经不用了：还活着就顺手关掉，别让它一直挂在托盘
      await killManagerPid(previous.managerPid);
    }
    if (previous.imports.length === 0 && previous.disabled.length === 0) {
      clearSessionState();
      return;
    }
    if (await this.patcherIsRunning(session.bridge)) {
      await this.stopPatcherOn(session.bridge);
    }
    const leftover = await this.dropRecorded(session.bridge, previous);
    if (leftover) {
      persistLeftovers(leftover);
      LogMsgUtil.sendLogMsg('[LTF] 上次注入还有模组没撤掉，已记下来下次再清');
    } else {
      clearSessionState();
      LogMsgUtil.sendLogMsg('[LTF] 已清理上一次注入留下的模组');
    }
  }

  private runLauncher(
    launcher: string,
    manager: string,
    logDir: string
  ): Promise<{ exitCode: number; pid: number | null }> {
    return new Promise((resolve) => {
      execFile(
        launcher,
        ['--exe', manager, '--quiet', '--log-dir', logDir],
        {
          cwd: path.dirname(launcher),
          windowsHide: true,
          timeout: LAUNCHER_TIMEOUT_MS,
          encoding: 'utf-8',
        },
        (error, stdout) => {
          const code = error && typeof (error as any).code === 'number' ? (error as any).code : 0;
          const match = /LTK_MANAGER_PID=(\d+)/.exec(stdout || '');
          resolve({ exitCode: code, pid: match ? parseInt(match[1], 10) : null });
        }
      );
    });
  }

  /** LTK Manager 自带的浏览器（CDP）比桥晚几秒才应答，先等它 */
  private async waitForCdp(bridge: LtkBridge): Promise<void> {
    const deadline = Date.now() + CDP_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        await bridge.library();
        return;
      } catch (error) {
        if (error instanceof BridgeUnavailable) {
          return;
        }
        if (!(error instanceof BridgeCommandError) || !/cdp|invoke|reading/i.test(error.message)) {
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, CDP_READY_POLL_MS));
    }
    console.warn('[LTF] LTK Manager 的内置浏览器一直没有应答');
  }

  private async healthCheckOff(bridge: LtkBridge): Promise<void> {
    try {
      const response = await bridge.healthCheckOff();
      if (response?.changed) {
        LogMsgUtil.sendLogMsg(
          '[LTF] 已关掉 LTK Manager 的「自动检查模组」，否则每局都要重新检查一遍皮肤'
        );
      }
    } catch (error) {
      console.warn('[LTF] 无法关闭 LTK Manager 的自动检查模组:', error);
    }
  }

  // ---- 模组 -----------------------------------------------------------

  /** 把皮肤压缩包以 .fantome 名字放到暂存目录（硬链接，跨盘就复制） */
  private async stageArchive(skin: SkinArchive): Promise<string> {
    const dir = stagingDir();
    await fsp.mkdir(dir, { recursive: true });
    const dest = path.join(dir, `${skin.heroId}_${skin.skinId}.fantome`);
    if (path.resolve(skin.archive) === path.resolve(dest)) {
      return dest;
    }
    try {
      await fsp.rm(dest, { force: true });
      await fsp.link(skin.archive, dest);
    } catch {
      await fsp.copyFile(skin.archive, dest);
    }
    return dest;
  }

  private async importOne(
    bridge: LtkBridge,
    archive: string,
    displayName: string
  ): Promise<TrackedImport> {
    const before = new Map(
      (await bridge.library()).map((entry) => [String(entry.id), entry] as const)
    );
    let response: Record<string, any>;
    try {
      response = await bridge.importArchive(archive, displayName);
    } catch (error) {
      // LTK Manager 读不到这个路径时，把内容直接发过去
      if (
        error instanceof BridgeCommandError &&
        /not found|cannot read|failed to read|读取/i.test(error.message)
      ) {
        LogMsgUtil.sendLogMsg(
          `[LTF] LTK Manager 读不到 ${path.basename(archive)}，改为直接发送内容`
        );
        response = await bridge.importBytes(await fsp.readFile(archive), path.basename(archive));
      } else {
        throw error;
      }
    }

    // 新装：{kind:"installed", mod:{...}}；同内容已在库里：{kind:"alreadyInstalled", mod:{...}}
    const value = response?.response?.value;
    const mod = value && typeof value === 'object' ? value.mod ?? value : null;
    const installedByUs = !value?.kind || value.kind === 'installed';

    let entry: LibraryEntry | null = mod?.id ? (mod as LibraryEntry) : null;
    let id = entry?.id ? String(entry.id) : null;

    if (!id) {
      const library = await bridge.library();
      const created = library.filter((item) => item.id && !before.has(String(item.id)));
      const named = created.filter((item) => entryNameMatches(item, displayName));
      entry = named.length > 0 ? named[named.length - 1] : created.length === 1 ? created[0] : null;
      id = entry?.id ? String(entry.id) : null;
    }
    if (!id) {
      throw new Error(`${displayName} 导入后不在 LTK Manager 的模组库里`);
    }

    const previous = before.get(id);
    const wasEnabled = previous ? previous.enabled === true : entry?.enabled === true;
    return { id, created: installedByUs && !previous, wasEnabled };
  }

  /** 只留本次的皮肤：把用户自己在 LTK Manager 里开着的模组临时关掉 */
  private async disableOtherMods(session: Session): Promise<void> {
    const ours = new Set(session.imports.map((item) => item.id));
    let library: LibraryEntry[];
    try {
      library = await session.bridge.library();
    } catch (error) {
      console.warn('[LTF] 读不到 LTK Manager 的模组库，其它已启用的模组可能也会生效:', error);
      return;
    }
    for (const entry of library) {
      const id = String(entry.id || '');
      if (!id || ours.has(id) || session.disabled.includes(id) || !entry.enabled) {
        continue;
      }
      try {
        await session.bridge.toggle(id, false);
        session.disabled.push(id);
        LogMsgUtil.sendLogMsg(`[LTF] 本局先关掉 ${entryName(entry)}，游戏结束后恢复`);
      } catch (error) {
        console.warn(`[LTF] 关不掉 ${entryName(entry)}，它可能也会一起生效:`, error);
      }
    }
  }

  /** 撤掉本次导入：新建的删掉，复用的恢复原开关 */
  private async dropImports(session: Session): Promise<void> {
    const leftover = await this.dropRecorded(session.bridge, session);
    session.imports = [];
    if (leftover) {
      persistLeftovers(leftover);
    }
  }

  /**
   * 把记录里的导入撤干净：新建的卸载、复用的恢复开关，用户的模组开回去。
   *
   * 返回仍没收尾的部分（预算用完 / 命令失败 / 库里还查得到），null 表示干净。
   * 条目已经被用户自己删掉的，算撤干净。
   */
  private async dropRecorded(
    bridge: LtkBridge,
    state: SessionState,
    budget: Budget = UNLIMITED
  ): Promise<SessionState | null> {
    const pendingImports: TrackedImport[] = [];
    for (const item of state.imports) {
      if (budgetExpired(budget)) {
        pendingImports.push(item);
        continue;
      }
      try {
        if (item.created) {
          await bridge.uninstall(item.id, budgetTimeout(budget));
        } else {
          await bridge.toggle(item.id, item.wasEnabled, budgetTimeout(budget));
        }
      } catch (error) {
        pendingImports.push(item);
        console.warn(`[LTF] 没能撤掉导入 ${item.id}:`, error);
      }
    }

    const pendingDisabled: string[] = [];
    for (const id of state.disabled) {
      if (budgetExpired(budget)) {
        pendingDisabled.push(id);
        continue;
      }
      try {
        await bridge.toggle(id, true, budgetTimeout(budget));
      } catch (error) {
        pendingDisabled.push(id);
        console.warn(`[LTF] 没能把用户的模组 ${id} 开回去:`, error);
      }
    }

    if (pendingImports.length === 0 && pendingDisabled.length === 0) {
      return null;
    }

    // 读一次库核对：已经不存在的条目不用再记账（下次会一直删失败）
    try {
      const ids = new Set((await bridge.library()).map((entry) => String(entry.id)));
      const imports = pendingImports.filter((item) => ids.has(item.id));
      const disabled = pendingDisabled.filter((id) => ids.has(id));
      if (imports.length === 0 && disabled.length === 0) {
        return null;
      }
      return {
        managerPid: state.managerPid,
        startedByUs: state.startedByUs,
        imports,
        disabled,
      };
    } catch {
      return {
        managerPid: state.managerPid,
        startedByUs: state.startedByUs,
        imports: pendingImports,
        disabled: pendingDisabled,
      };
    }
  }

  // ---- patcher --------------------------------------------------------

  private async patcherIsRunning(bridge: LtkBridge): Promise<boolean> {
    try {
      const value = (await bridge.patcherStatus())?.response?.value;
      return !!(value && typeof value === 'object' && value.running);
    } catch {
      return false;
    }
  }

  private async startPatcher(session: Session): Promise<void> {
    try {
      await session.bridge.startPatcher();
    } catch (error) {
      // 上一个 patcher 还在构建 overlay：等它停掉再起一次
      if (
        error instanceof BridgeCommandError &&
        /already_running|already running|busy/i.test(error.message) &&
        (await this.waitPatcherStopped(session))
      ) {
        await session.bridge.startPatcher();
        return;
      }
      throw error;
    }
  }

  private async waitPatcherStopped(session: Session): Promise<boolean> {
    LogMsgUtil.sendLogMsg('[LTF] 上一个 patcher 还在构建 overlay，等它停下来');
    try {
      await session.bridge.stopPatcher();
    } catch (error) {
      console.debug('[LTF] 停止上一个 patcher:', error);
    }
    const deadline = Date.now() + PATCHER_STOP_WAIT_MS;
    while (Date.now() < deadline) {
      try {
        const payload = (await session.bridge.patcherStatus())?.response;
        const value = payload?.value;
        if (value && typeof value === 'object' && !value.running) {
          return true;
        }
      } catch {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, PATCHER_STOP_POLL_MS));
    }
    console.warn('[LTF] 上一个 patcher 没有在限期内停下');
    return false;
  }

  /** 停 patcher，并等它真的停下（它停下之前不会接受库的改动） */
  private async stopPatcher(session: Session, budget: Budget = UNLIMITED): Promise<void> {
    await this.stopPatcherOn(session.bridge, budget, session);
  }

  /**
   * 停 patcher 并轮询到 `running=false`。
   *
   * 预算用完就直接返回：退出程序时不能为了等它而卡住，剩下的交给
   * 「关掉 LTK Manager」—— 管理器一关，它的 patcher 也跟着没。
   */
  private async stopPatcherOn(
    bridge: LtkBridge,
    budget: Budget = UNLIMITED,
    session?: Session
  ): Promise<void> {
    try {
      await bridge.stopPatcher(budgetTimeout(budget, PATCHER_STOP_WAIT_MS));
    } catch (error) {
      console.debug('[LTF] 停止 patcher:', error);
    }
    if (session) {
      session.patcherRunning = false;
    }
    const waitMs = Number.isFinite(budget.deadline)
      ? Math.min(PATCHER_STOP_WAIT_MS, Math.max(budgetLeft(budget), 0))
      : PATCHER_STOP_WAIT_MS;
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      try {
        const value = (await bridge.patcherStatus())?.response?.value;
        if (!value || typeof value !== 'object' || !value.running) {
          return;
        }
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, PATCHER_STOP_POLL_MS));
    }
  }

  // ---- 收尾 -----------------------------------------------------------

  /**
   * 结束会话：停 patcher → 删掉本次导入 → 把用户的模组开回去 → 关闭自己启动的
   * LTK Manager。*graceful* 为 false 时（注入失败 / 程序退出）也照做，只是不提示。
   *
   * 给*budget* 时每步都受时间限制；没做完的部分会留在 ltf_session.json 里，
   * 下次启动接着清。
   */
  private async endSession(
    session: Session,
    graceful: boolean,
    budget: Budget = UNLIMITED
  ): Promise<void> {
    if (!(await session.bridge.alive())) {
      // 桥没了：库里我们装的条目只能等下次启动再删
      persistLeftovers(session);
      if (session.startedByUs) {
        await killManagerPid(session.managerPid);
      }
      return;
    }

    if (await this.patcherIsRunning(session.bridge)) {
      await this.stopPatcher(session, budget);
    } else {
      session.patcherRunning = false;
    }
    const leftover = await this.dropRecorded(session.bridge, session, budget);
    session.imports = [];
    session.disabled = [];

    if (session.startedByUs) {
      const graceMs = Number.isFinite(budget.deadline)
        ? SHUTDOWN_MANAGER_GRACE_MS
        : MANAGER_EXIT_GRACE_MS;
      await closeManager(session.bridge, session.managerPid, graceMs);
    }

    if (leftover) {
      persistLeftovers(leftover);
    } else {
      clearSessionState();
    }
    if (graceful) {
      LogMsgUtil.sendLogMsg(
        leftover ? '[LTF] 已停止注入（有模组没撤掉，下次启动再清）' : '[LTF] 已停止注入'
      );
    }
  }
}

/** 进程马上要退出时的同步兜底：把我们启动、还没关掉的 LTK Manager 结束掉 */
export const killLeftoverManagerSync = (): void => {
  const state = readSessionState();
  if (!state?.startedByUs || !state.managerPid) {
    return;
  }
  const pid = state.managerPid;
  try {
    const check = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], {
      windowsHide: true,
      encoding: 'utf-8',
    });
    if (!`${check.stdout || ''}`.toLowerCase().includes('ltk-manager')) {
      return;
    }
    spawnSync('taskkill', ['/PID', `${pid}`, '/T', '/F'], { windowsHide: true });
    console.warn(`[LTF] 退出兜底：已结束 LTK Manager（PID ${pid}）`);
  } catch (error) {
    console.warn('[LTF] 退出兜底失败:', error);
  }
};

const entryName = (entry: LibraryEntry): string =>
  String(entry.displayName || entry.name || entry.id || '未知模组');

const entryNameMatches = (entry: LibraryEntry, displayName: string): boolean => {
  const names = new Set([
    String(entry.displayName || '').toLowerCase(),
    String(entry.name || '').toLowerCase(),
  ]);
  return names.has(displayName.toLowerCase());
};

export const ltfInjector = new LtfInjector();
