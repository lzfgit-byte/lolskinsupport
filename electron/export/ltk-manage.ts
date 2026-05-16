/**
 * Standalone Skin Applier - 独立的皮肤生成和应用工具
 *
 * 功能：
 * 1. 从 wad.client 文件生成指定皮肤的 .fantome 文件
 * 2. 将皮肤文件挂载到游戏中并生效
 *
 * 使用方式：
 * npx ts-node scripts/standalone-skin-applier.ts --help
 */

import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

// ==================== 配置 ====================
const CONFIG = {
  LTK_MANAGER_PATH: 'E:\\Program Files (x86)\\bocchi\\electron\\resources\\ltk-manager.exe',
  CSLOL_DLL_PATH: 'C:\\Users\\18074\\AppData\\Roaming\\bocchi\\cslol-tools\\cslol-dll.dll',
  TEMP_BASE: path.join(os.tmpdir(), 'bocchi-skin-applier'),
  HASH_TABLE_PATH: 'C:\\Users\\18074\\AppData\\Roaming\\bocchi\\cslol-tools\\hashes.game.txt',
};

// ==================== 类型定义 ====================

interface GenerationItem {
  skinNumber: number;
  fileLabel: string;
  displayName: string;
}

interface GenerationRequest {
  wadPath: string;
  champion: string;
  items: GenerationItem[];
  outputDir: string;
  author: string;
  hashtablePath?: string;
}

interface RustGenerationResult {
  success: boolean;
  skinNumber: number;
  outputPath?: string;
  sizeBytes?: number;
  error?: string;
}

interface SkinGenerationOptions {
  wadPath: string;
  champion: string;
  skinIds: number[];
  outputDir: string;
  author?: string;
  hashtablePath?: string;
}

interface SkinApplyOptions {
  gamePath: string;
  fantomePaths: string[];
  timeout?: number;
}

// ==================== 工具函数 ====================

/**
 * 执行带超时的命令
 */
function execCommandWithTimeout(
  command: string,
  args: string[],
  timeout = 300000,
  stdin?: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let stdout = '';
    let stderr = '';
    let cancelled = false;

    const timer = setTimeout(() => {
      if (!cancelled) {
        process.kill();
        const timeoutSeconds = Math.round(timeout / 1000);
        reject(new Error(`Process timed out after ${timeoutSeconds} seconds`));
      }
    }, timeout);

    if (process.stdin && stdin) {
      process.stdin.write(stdin);
      process.stdin.end();
    }

    process.stdout?.on('data', (data) => {
      stdout += data.toString('utf-8');
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString('utf-8');
    });

    process.on('close', (code) => {
      clearTimeout(timer);
      if (cancelled) return;

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (err) => {
      clearTimeout(timer);
      cancelled = true;
      reject(err);
    });
  });
}

/**
 * 记录信息
 */
function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    info: '[INFO]',
    warn: '[WARN]',
    error: '[ERROR]',
  }[level];
  console.log(`${timestamp} ${prefix} ${message}`);
}

/**
 * 验证文件存在
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 递归创建目录
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code !== 'EEXIST') {
      throw error;
    }
  }
}

// ==================== 核心功能 ====================

/**
 * 生成皮肤文件（Fantome）
 */
export async function generateSkin(options: SkinGenerationOptions): Promise<string[]> {
  const {
    wadPath,
    champion,
    skinIds,
    outputDir,
    author = 'Bocchi User',
    hashtablePath = CONFIG.HASH_TABLE_PATH,
  } = options;

  log(`开始生成皮肤文件...`);
  log(`WAD 文件: ${wadPath}`);
  log(`英雄: ${champion}`);
  log(`皮肤 IDs: ${skinIds.join(', ')}`);

  // 验证输入
  if (!fileExists(wadPath)) {
    throw new Error(`WAD 文件不存在: ${wadPath}`);
  }

  if (!fileExists(CONFIG.LTK_MANAGER_PATH)) {
    throw new Error(`ltk-manager.exe 不存在: ${CONFIG.LTK_MANAGER_PATH}`);
  }

  // 确保输出目录存在
  await ensureDir(outputDir);

  // 构建生成请求
  const items: GenerationItem[] = skinIds.map((skinId) => ({
    skinNumber: skinId,
    fileLabel: `${champion}_Skin${skinId}`,
    displayName: `${champion} Skin ${skinId}`,
  }));

  const generationRequest: GenerationRequest = {
    wadPath: path.resolve(wadPath),
    champion,
    items,
    outputDir: path.resolve(outputDir),
    author,
    hashtablePath: hashtablePath ? path.resolve(hashtablePath) : undefined,
  };

  log(`生成请求: ${JSON.stringify(generationRequest, null, 2)}`);

  // 调用 ltk-manager fantonize
  const requestJson = JSON.stringify(generationRequest);

  try {
    const { stdout, stderr } = await execCommandWithTimeout(
      CONFIG.LTK_MANAGER_PATH,
      ['fantonize', '--request-json', '-'],
      300000,
      requestJson
    );

    log(`生成命令输出 (stderr): ${stderr}`);

    // 解析结果
    const results: RustGenerationResult[] = JSON.parse(stdout.trim());
    const generatedFiles: string[] = [];

    results.forEach((result, idx) => {
      if (result.success && result.outputPath) {
        log(
          `✓ 皮肤 #${result.skinNumber} 生成成功: ${result.outputPath} (${
            (result.sizeBytes || 0) / 1024 / 1024
          }MB)`
        );
        generatedFiles.push(result.outputPath);
      } else {
        log(`✗ 皮肤 #${result.skinNumber} 生成失败: ${result.error}`, 'error');
      }
    });

    if (generatedFiles.length === 0) {
      throw new Error('没有成功生成任何皮肤文件');
    }

    log(`✓ 成功生成 ${generatedFiles.length} 个皮肤文件`);
    return generatedFiles;
  } catch (error) {
    log(`生成皮肤失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * 应用皮肤（创建 overlay + 运行 patcher）
 */
export async function applySkin(options: SkinApplyOptions): Promise<void> {
  const { gamePath, fantomePaths, timeout = 300000 } = options;

  log(`开始应用皮肤...`);
  log(`游戏路径: ${gamePath}`);
  log(`皮肤文件: ${fantomePaths.join(', ')}`);

  // 验证输入
  if (!fileExists(gamePath)) {
    throw new Error(`游戏目录不存在: ${gamePath}`);
  }

  if (!fileExists(CONFIG.LTK_MANAGER_PATH)) {
    throw new Error(`ltk-manager.exe 不存在: ${CONFIG.LTK_MANAGER_PATH}`);
  }

  if (!fileExists(CONFIG.CSLOL_DLL_PATH)) {
    throw new Error(`cslol-dll.dll 不存在: ${CONFIG.CSLOL_DLL_PATH}`);
  }

  for (const fantomePath of fantomePaths) {
    if (!fileExists(fantomePath)) {
      throw new Error(`皮肤文件不存在: ${fantomePath}`);
    }
  }

  try {
    // 步骤 1: 创建临时目录结构
    const tempId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const profilePath = path.join(CONFIG.TEMP_BASE, `profile_${tempId}`);
    const stateDir = `${profilePath}.state`;

    log(`创建临时目录: ${profilePath}`);
    await ensureDir(profilePath);
    await ensureDir(stateDir);

    // 步骤 2: 构建 mkoverlay 命令
    log(`步骤 1/2: 构建 Mod Overlay...`);
    const mkoverlayArgs = [
      'mkoverlay',
      '--game',
      path.normalize(gamePath),
      '--overlay',
      path.normalize(profilePath),
      '--state',
      path.normalize(stateDir),
      ...fantomePaths.flatMap((p) => ['--mod', p]),
    ];

    log(`执行命令: ltk-manager ${mkoverlayArgs.join(' ')}`);
    const { stderr: mkoverlaySterr } = await execCommandWithTimeout(
      CONFIG.LTK_MANAGER_PATH,
      mkoverlayArgs,
      timeout
    );

    if (mkoverlaySterr) {
      log(`mkoverlay 输出: ${mkoverlaySterr}`);
    }

    log(`✓ Overlay 构建成功`);

    // 步骤 3: 运行 patcher
    log(`步骤 2/2: 运行 Patcher 并应用皮肤...`);

    const patcherArgs = [
      'patcher',
      '--dll',
      CONFIG.CSLOL_DLL_PATH,
      '--overlay-root',
      path.normalize(profilePath),
      '--flags',
      '0',
    ];

    log(`执行命令: ltk-manager ${patcherArgs.join(' ')}`);

    await runPatcherWithMonitoring(CONFIG.LTK_MANAGER_PATH, patcherArgs);

    log(`✓ 皮肤应用完成`);
  } catch (error) {
    log(`应用皮肤失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    throw error;
  }
}

/**
 * 运行 patcher 并监控输出
 */
function runPatcherWithMonitoring(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let isResolved = false;

    // 监听 stdout
    process.stdout?.on('data', (data) => {
      const lines = data
        .toString()
        .split('\n')
        .filter((l) => l.trim());
      lines.forEach((line) => {
        if (!line.startsWith('[DLL]')) {
          log(`[Patcher] ${line}`);
        }
      });
    });

    // 监听 stderr
    process.stderr?.on('data', (data) => {
      const lines = data
        .toString()
        .split('\n')
        .filter((l) => l.trim());
      lines.forEach((line) => {
        if (!line.startsWith('[DLL]')) {
          log(`[Patcher Error] ${line}`, 'warn');
        }
      });
    });

    // 进程关闭
    process.on('close', (code) => {
      if (!isResolved) {
        isResolved = true;
        if (code === 0) {
          log(`Patcher 正常退出`);
          resolve();
        } else {
          reject(new Error(`Patcher 进程异常退出: 代码 ${code}`));
        }
      }
    });

    // 进程错误
    process.on('error', (error) => {
      if (!isResolved) {
        isResolved = true;
        reject(error);
      }
    });

    // 监听 stdin 以实现优雅关闭
    setTimeout(() => {
      log(`Patcher 运行中，等待游戏修改完成...`);
    }, 1000);
  });
}

// ==================== CLI 命令 ====================

/**
 * CLI 入口
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
使用方式:
  npx ts-node scripts/standalone-skin-applier.ts <command> [options]

命令:
  generate   生成皮肤文件
  apply      应用皮肤到游戏
  full       完整流程（生成 + 应用）

生成皮肤:
  npx ts-node scripts/standalone-skin-applier.ts generate \\
    --wad /path/to/champion.wad.client \\
    --champion Ahri \\
    --skins 0,1,2 \\
    --output /output/dir

应用皮肤:
  npx ts-node scripts/standalone-skin-applier.ts apply \\
    --game "C:/League of Legends/Game" \\
    --fantomes /path/to/skin1.fantome,/path/to/skin2.fantome

完整流程:
  npx ts-node scripts/standalone-skin-applier.ts full \\
    --wad /path/to/champion.wad.client \\
    --champion Ahri \\
    --skins 0,1,2 \\
    --game "C:/League of Legends/Game"
    `);
    process.exit(0);
  }

  const command = args[0];

  try {
    if (command === 'generate') {
      await handleGenerate(args.slice(1));
    } else if (command === 'apply') {
      await handleApply(args.slice(1));
    } else if (command === 'full') {
      await handleFull(args.slice(1));
    } else {
      console.error(`未知命令: ${command}`);
      process.exit(1);
    }
  } catch (error) {
    log(`错误: ${error instanceof Error ? error.message : String(error)}`, 'error');
    process.exit(1);
  }
}

/**
 * 处理 generate 命令
 */
async function handleGenerate(args: string[]) {
  const options = parseArgs(args);

  const wadPath = options.wad || options.w;
  const champion = options.champion || options.c;
  const skinIds = (options.skins || options.s || '0').split(',').map(Number);
  const outputDir = options.output || options.o || './output';
  const author = options.author || options.a || 'Bocchi';

  if (!wadPath || !champion) {
    throw new Error('缺少必需参数: --wad 和 --champion');
  }

  const generatedFiles = await generateSkin({
    wadPath,
    champion,
    skinIds,
    outputDir,
    author,
  });

  console.log('\n生成完成！');
  console.log('生成的文件:');
  generatedFiles.forEach((file) => console.log(`  - ${file}`));
}

/**
 * 处理 apply 命令
 */
async function handleApply(args: string[]) {
  const options = parseArgs(args);

  const gamePath = options.game || options.g;
  const fantomesStr = options.fantomes || options.f;

  if (!gamePath || !fantomesStr) {
    throw new Error('缺少必需参数: --game 和 --fantomes');
  }

  const fantomePaths = fantomesStr.split(',').map((p) => p.trim());

  await applySkin({
    gamePath,
    fantomePaths,
  });

  console.log('\n应用完成！');
}

/**
 * 处理 full 命令（完整流程）
 */
async function handleFull(args: string[]) {
  const options = parseArgs(args);

  const wadPath = options.wad || options.w;
  const champion = options.champion || options.c;
  const skinIds = (options.skins || options.s || '0').split(',').map(Number);
  const gamePath = options.game || options.g;
  const outputDir = options.output || options.o || path.join(CONFIG.TEMP_BASE, 'generated');
  const author = options.author || options.a || 'Bocchi';

  if (!wadPath || !champion || !gamePath) {
    throw new Error('缺少必需参数: --wad、--champion 和 --game');
  }

  console.log('\n========== 皮肤生成和应用完整流程 ==========\n');

  // 步骤 1: 生成皮肤
  log(`阶段 1: 生成皮肤文件`);
  const generatedFiles = await generateSkin({
    wadPath,
    champion,
    skinIds,
    outputDir,
    author,
  });

  console.log(`\n✓ 成功生成 ${generatedFiles.length} 个皮肤文件\n`);

  // 步骤 2: 应用皮肤
  log(`阶段 2: 应用皮肤到游戏`);
  await applySkin({
    gamePath,
    fantomePaths: generatedFiles,
  });

  console.log(`\n========== 完成 ==========`);
  console.log(`✓ 皮肤已成功应用到游戏`);
  console.log(`生成的皮肤文件位于: ${outputDir}`);
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        result[key] = value;
        i++;
      }
    } else if (args[i].startsWith('-')) {
      const key = args[i].slice(1);
      const value = args[i + 1];
      if (value && !value.startsWith('-')) {
        result[key] = value;
        i++;
      }
    }
  }
  return result;
}

// ==================== 导出 ====================

export { SkinGenerationOptions, SkinApplyOptions, GenerationItem, GenerationRequest };

// 运行 CLI
if (require.main === module) {
  main();
}
