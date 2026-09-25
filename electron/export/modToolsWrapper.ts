import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { LogMsgUtil } from '../utils/message';
import { LTK_PATCHER_HOST, LtkPatcherSession, checkLtkPatcher } from './ltkPatcherHost';

export class ModToolsWrapper {
  private installedPath: string;
  private activeProcesses: ChildProcess[] = [];
  private isCancelled = false;
  private currentOperation: ChildProcess | null = null;
  private applyInProgress = false;
  private importedMods: string[] = []; // Track successfully imported mods for cleanup
  /** 当前接管 overlay 的 LTK patcher host 会话 */
  private ltkSession: LtkPatcherSession | null = null;

  constructor() {}

  public sendState = () => {};

  /**
   * 只杀 mod-tools.exe。
   *
   * 注意：mkoverlay 期间 LTK patcher host 正在扫描，所以这里**不能**顺手把 host
   * 一起杀掉，否则刚挂上的 host 会被自己清掉。要一起关掉请用 stopOverlay()。
   */
  public async forceKillModTools(): Promise<void> {
    await this.killByImageName('mod-tools.exe');
  }

  /** 强杀所有 ltk_patcher_host.exe（用于异常残留清理） */
  public async forceKillLtkPatcherHost(): Promise<void> {
    await this.killByImageName(LTK_PATCHER_HOST);
  }

  private killByImageName(imageName: string): Promise<void> {
    return new Promise((resolve) => {
      const process = spawn('taskkill', ['/F', '/IM', imageName]);
      process.on('close', () => {
        console.log(`[ModToolsWrapper] Attempted to kill all ${imageName} processes.`);
        resolve();
      });
      process.on('error', () => {
        resolve();
      });
    });
  }

  public async ensureCleanDirectoryWithRetry(dirPath: string, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
        await fs.mkdir(dirPath, { recursive: true });
        return;
      } catch (error) {
        console.warn(`[ModToolsWrapper] Clean directory attempt ${i + 1} failed for ${dirPath}`);
        if (i === retries - 1) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * 启动 LTK patcher host 来接管 overlay（取代原来的 `mod-tools.exe runoverlay`）。
   *
   * mod-tools.exe 现在只负责 import / mkoverlay 生成 overlay 文件，真正把 overlay
   * 挂进游戏的是 ltk_patcher_host.exe：它常驻扫描游戏进程，DLL 被注入后按 prefix
   * 目录里的 WAD 覆盖资源。
   *
   * 调用时机很关键：必须在 mkoverlay **之前**调用 —— DLL 只对「扫描开始之后启动」
   * 的游戏生效。
   *
   * @param modToolsPath 配置里的 mod-tools.exe 路径；host / dll 与它同级
   * @param overlayDir   mkoverlay 的输出目录，同时作为 host 的 prefix
   */
  public async startLtkPatcher(
    modToolsPath: string,
    overlayDir: string
  ): Promise<{ ok: boolean; error?: string }> {
    // 同一时间只保留一个 host，避免多个 host 抢着注入
    await this.stopOverlay();

    const status = checkLtkPatcher(modToolsPath);
    if (status.missing.length > 0) {
      return {
        ok: false,
        error: `缺少 ${status.missing.join('、')}，请把 LTK Manager 的这两个文件放到 ${path.dirname(
          modToolsPath
        )}`,
      };
    }
    if (status.expired) {
      const date = new Date((status.eol as number) * 1000).toLocaleDateString();
      return {
        ok: false,
        error: `LTK patcher 已于 ${date} 过期，请用 LTK Manager 更新 ltk_patcher_host.exe / ltk_patcher_dll.dll`,
      };
    }

    // host 会校验 `config prefix` 的路径必须已存在（否则回
    // `error ... prefix path does not exist`），所以目录要先建出来。
    // 这不影响 mkoverlay：mkOverlay 是看「目录里有没有 wad」决定要不要重建的。
    try {
      await fs.mkdir(overlayDir, { recursive: true });
    } catch {
      // 目录已存在，忽略
    }

    const session = new LtkPatcherSession({
      onLog: (line) => {
        console.log(`[LTK-PATCHER]: ${line}`);
        // dll / status 原始行太吵，改由 onStatus / onError 输出格式化后的信息
        if (line.startsWith('dll ') || line.startsWith('status ')) {
          return;
        }
        LogMsgUtil.sendLogMsg(line);
      },
      onError: (message) => {
        console.error(`[LTK-PATCHER ERROR]: ${message}`);
        LogMsgUtil.sendLogMsg(message);
      },
      onStatus: (state, message) => {
        if (state === 'failed') {
          return;
        }
        LogMsgUtil.sendLogMsg(`LTK patcher: ${state}${message ? ` ${message}` : ''}`);
      },
    });

    if (!(await session.start(status.host, overlayDir))) {
      return { ok: false, error: session.error ?? 'LTK patcher 启动失败' };
    }

    this.ltkSession = session;
    this.applyInProgress = false;
    return { ok: true };
  }

  public async execToolWithTimeout(
    command: string,
    args: string[],
    timeout: number,
    sendProgress = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check if cancelled before starting
      if (this.isCancelled) {
        reject(new Error('Operation cancelled by user'));
        return;
      }

      const process = spawn(command, args, {});
      this.currentOperation = process;
      this.activeProcesses.push(process);

      let stdout = '';
      let stderr = '';
      let cancelled = false;

      const timer = setTimeout(() => {
        if (!cancelled) {
          process.kill();
          this.cleanupProcess(process);
          this.currentOperation = null;
          const timeoutSeconds = Math.round(timeout / 1000);
          reject(new Error(`Process timed out after ${timeoutSeconds} seconds`));
        }
      }, timeout);

      // Check for cancellation periodically
      const cancellationChecker = setInterval(() => {
        if (this.isCancelled && !cancelled) {
          cancelled = true;
          clearInterval(cancellationChecker);
          clearTimeout(timer);
          process.kill();
          this.cleanupProcess(process);
          this.currentOperation = null;
          reject(new Error('Operation cancelled by user'));
        }
      }, 100); // Check every 100ms

      process.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        // Send progress to renderer if requested
        if (sendProgress) {
          const lines = output.split('\n').filter((line) => line.trim());
          lines.forEach((line) => {
            const trimmedLine = line.trim();
            console.log(`[MOD-TOOLS]: ${trimmedLine}`);
            LogMsgUtil.sendLogMsg(trimmedLine);
          });
        }
      });

      process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;

        // Also send stderr to renderer if it contains status info
        if (sendProgress) {
          const lines = output.split('\n').filter((line) => line.trim());
          lines.forEach((line) => {
            const trimmedLine = line.trim();
            if (trimmedLine.includes('[INFO]') || trimmedLine.includes('[WARN]')) {
              console.log(`[MOD-TOOLS]: ${trimmedLine}`);
              LogMsgUtil.sendLogMsg(trimmedLine);
            }
          });
        }
      });

      process.on('close', (code) => {
        clearTimeout(timer);
        clearInterval(cancellationChecker);
        this.cleanupProcess(process);
        this.currentOperation = null;

        if (cancelled) {
          reject(new Error('Operation cancelled by user'));
        } else if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        clearTimeout(timer);
        clearInterval(cancellationChecker);
        this.cleanupProcess(process);
        this.currentOperation = null;
        LogMsgUtil.sendLogMsg(err?.message);
        reject(err);
      });
    });
  }

  public cleanupProcess(process: ChildProcess | null) {
    if (!process) {
      return;
    }
    const index = this.activeProcesses.indexOf(process);
    if (index > -1) {
      this.activeProcesses.splice(index, 1);
    }
  }

  /**
   * 停止 overlay 接管：先请 host 自己退出，再清掉可能残留的 mod-tools.exe。
   */
  async stopOverlay(): Promise<void> {
    const session = this.ltkSession;
    this.ltkSession = null;
    if (session) {
      console.info('[ModToolsWrapper] Stopping LTK patcher session');
      await session.stop();
    }
    await this.forceKillModTools();
  }

  /** 是否正在由 LTK patcher host 接管 overlay */
  isRunning(): boolean {
    return this.ltkSession?.running ?? false;
  }

  async cancelApply(): Promise<{ success: boolean; message: string }> {
    if (!this.applyInProgress) {
      return { success: false, message: 'No apply operation in progress' };
    }

    console.info('[ModToolsWrapper] Cancelling apply operation...');
    this.isCancelled = true;

    // Kill current operation if running
    if (this.currentOperation) {
      console.info('[ModToolsWrapper] Killing current operation');
      this.currentOperation.kill();
      this.currentOperation = null;
    }

    // Kill all active processes
    for (const process of this.activeProcesses) {
      if (!process.killed) {
        process.kill();
      }
    }
    this.activeProcesses = [];

    // Force kill all mod-tools / LTK patcher processes
    await this.stopOverlay();
    await this.forceKillLtkPatcherHost();

    // Optionally cleanup partially imported mods
    if (this.importedMods.length > 0) {
      console.info(
        `[ModToolsWrapper] Cleaning up ${this.importedMods.length} partially imported mods`
      );
      for (const modName of this.importedMods) {
        try {
          const modPath = path.join(this.installedPath, modName);
          await fs.rm(modPath, { recursive: true, force: true }).catch(() => {});
        } catch (error) {
          console.warn(`[ModToolsWrapper] Failed to cleanup ${modName}:`, error);
        }
      }
    }

    // Reset state
    this.applyInProgress = false;
    this.importedMods = [];

    LogMsgUtil.sendLogMsg('Apply operation cancelled');

    return { success: true, message: 'Apply operation cancelled successfully' };
  }

  isApplying(): boolean {
    return this.applyInProgress;
  }
}
