import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { LogMsgUtil } from '../utils/message';

/**
 * 外部小工具的执行封装。
 *
 * 注入已经交给 LTK Manager（见 ltfSession.ts），这里只剩「跑一次性命令」的
 * 能力：生成皮肤时用的 wad-make / wad-extract / ritobin 等，以及目录清理。
 * mod-tools.exe 不再参与注入。
 */
export class ModToolsWrapper {
  private activeProcesses: ChildProcess[] = [];
  private currentOperation: ChildProcess | null = null;

  public sendState = () => {};

  /** 强杀可能残留的 mod-tools.exe（只用于异常清理，注入流程不再启动它） */
  public async forceKillModTools(): Promise<void> {
    await this.killByImageName('mod-tools.exe');
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

  public async execToolWithTimeout(
    command: string,
    args: string[],
    timeout: number,
    sendProgress = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {});
      this.currentOperation = process;
      this.activeProcesses.push(process);

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        process.kill();
        this.cleanupProcess(process);
        this.currentOperation = null;
        const timeoutSeconds = Math.round(timeout / 1000);
        reject(new Error(`Process timed out after ${timeoutSeconds} seconds`));
      }, timeout);

      process.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        if (sendProgress) {
          const lines = output.split('\n').filter((line) => line.trim());
          lines.forEach((line) => {
            const trimmedLine = line.trim();
            console.log(`[MOD-TOOLS]: ${trimmedLine}`);
            LogMsgUtil.sendLogMsg(trimmedLine);
          });
        }
      });

      process.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;

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
        this.cleanupProcess(process);
        this.currentOperation = null;

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        clearTimeout(timer);
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

  /** 中断正在跑的命令（生成皮肤之类），不影响 LTK Manager 里的注入 */
  async cancelApply(): Promise<{ success: boolean; message: string }> {
    console.info('[ModToolsWrapper] Cancelling running tool...');
    if (this.currentOperation) {
      this.currentOperation.kill();
      this.currentOperation = null;
    }
    for (const process of this.activeProcesses) {
      if (!process.killed) {
        process.kill();
      }
    }
    this.activeProcesses = [];
    return { success: true, message: 'Running tool cancelled' };
  }
}
