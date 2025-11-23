import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { LogMsgUtil } from '../utils/message';

export class ModToolsWrapper {
  private profilesPath: string;
  private installedPath: string;
  private runningProcess: ChildProcess | null = null;
  private activeProcesses: ChildProcess[] = [];
  private timeout = 300000; // Default 5 minutes in milliseconds
  private isCancelled = false;
  private currentOperation: ChildProcess | null = null;
  private applyInProgress = false;
  private importedMods: string[] = []; // Track successfully imported mods for cleanup

  constructor() {
    this.sendState();
  }

  public sendState = () => {
    setInterval(() => {
      LogMsgUtil.sendLogMsg(`${this.isCancelled}`);
      LogMsgUtil.sendLogMsg(`${this.isRunning()}`);
    }, 1000);
  };

  public async forceKillModTools(): Promise<void> {
    return new Promise((resolve) => {
      const process = spawn('taskkill', ['/F', '/IM', 'mod-tools.exe']);
      process.on('close', () => {
        console.log(`[ModToolsWrapper] Attempted to kill all mod-tools.exe processes.`);
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
      // Check if cancelled before starting
      if (this.isCancelled) {
        reject(new Error('Operation cancelled by user'));
        return;
      }

      const process = spawn(command, args);
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

  async stopOverlay(): Promise<void> {
    if (this.runningProcess) {
      this.runningProcess.stdin?.write('\n');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (this.runningProcess && !this.runningProcess.killed) {
        this.runningProcess.kill();
      }
      this.runningProcess = null;
    }
    await this.forceKillModTools();
  }

  isRunning(): boolean {
    return this.runningProcess !== null && !this.runningProcess.killed;
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

    // Force kill all mod-tools processes
    await this.forceKillModTools();

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
