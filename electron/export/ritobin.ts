/**
 * ritobin-tools（LeagueToolkit 的命令行工具，0.2.3+）的调用封装。
 *
 * 老版本用的是 `ritobin_cli.exe`（2025-10 的 ritobin 分支），它有几个毛病：
 *
 *   - **读遍名字表**：每次启动都把 `ritobin\bin\hashes\` 下的表读进内存
 *     （完整的 `hashes.game.txt` 有 219 MB），5 KB 的 bin 也要 3.3 s；
 *   - **解不了新 bin**：16.21 之后的 bin（Ahri skin0 这类）直接报
 *     `read_sections() / read_entries()` 错误 —— 新版 bin 格式它不认。
 *
 * 换到 `ritobin-tools` 之后这两条都没了：名字表按需从 Mimir 缓存读，新版 bin
 * 也能转。调用方式也换了（子命令 + 选项）：
 *
 *   bin→py：`ritobin-tools -H <表目录> --hashtable-dir <空目录> convert <目录> -r --ext py`
 *   py→bin：`ritobin-tools convert <目录> -r --to bin`
 *
 * 两个参数的作用：
 *
 *   - `-H <表目录>`：额外的 CDragon 文本表（`hashes.binfields.txt` 等）。指到我们
 *     生成的精简表，没列进去的名字照旧印成 `0x...` 哈希 —— 和以前 `-d` 的行为一致，
 *     bin 里存的本来就是哈希，py→bin 时再哈希回同样的值。已用真实 bin 验证
 *     `bin→py→bin` 逐字节一致（Jade_Vayne Skin11 234728 B，新旧工具产出同一个文件）。
 *   - `--hashtable-dir <空目录>`：新工具默认读 LTK 共享缓存
 *     （`%LOCALAPPDATA%\LeagueToolkit\hashes`，约 58 MB）。本机装了 LTK Manager 时
 *     它会解出所有名字，没装的机器就全是哈希 —— 同一份 bin 转出来的文本不一样。
 *     指到一个空目录，行为就统一了（会有一行 WARN，走 stderr，不影响结果）。
 *
 * 如果哪天游戏改了字段名，锚点就解不出来 —— 这时 `convertBinsToPy` 会删掉这批 py、
 * 换随包那份完整表重转一次，输出仍然是「能转就转」，只是慢一点点。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveToolsDir } from '../utils/tools-path';

/**
 * 改写逻辑依赖的字段/类型名，必须出现在精简名字表里。
 * `skin-audio.ts` 认 tagEventList / bankUnits / bankPath / events / voiceOver / name，
 * `skin-rebase.ts` 认 championSkinName / skeleton / simpleSkin，
 * `skin-animation.ts` 认 animationGraphData（皮肤 bin 里的动画图链接），
 * `skin-rebase.ts` 认 skinUpgradeData / SkinUpgradeData / mGearSkinUpgrades（gear 形态），
 * `load-skin-data.ts` 的 patchPyFile 认 SkinCharacterDataProperties / mResourceResolver / ResourceResolver。
 */
export const RITOBIIN_NAMES = [
  'SkinCharacterDataProperties',
  'ResourceResolver',
  'SkinAudioProperties',
  'mResourceResolver',
  'BankUnit',
  'championSkinId',
  'championSkinName',
  'animationGraphData',
  'skinUpgradeData',
  'SkinUpgradeData',
  'mGearSkinUpgrades',
  'mCharacterSubmeshesToShow',
  'mCharacterSubmeshesToHide',
  'initialSubmeshToHide',
  'mVFXResourceResolver',
  'resourceMap',
  'skeleton',
  'simpleSkin',
  'tagEventList',
  'bankUnits',
  'bankPath',
  'name',
  'events',
  'voiceOver',
];

/** ritobin 哈希表用的算法：FNV-1a 32 位，先转小写（和 hashes.*.txt 里的值一致） */
export const ritobinHash = (name: string): string => {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(name.toLowerCase(), 'utf8')) {
    hash ^= byte;
    // 乘 0x01000193 用移位加代替，避免 32 位溢出丢精度
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/** 随包的可执行文件：`<tools>\ritobin\bin\ritobin-tools.exe` */
export const RITOBIIN_TOOL_FILE = 'ritobin-tools.exe';

/**
 * ritobin 永远用随包这份（路径、名字表都在自己手里），不跟着 `MOD_TOOLS_PATH`
 * 走 —— 用户自定义的 cslol-tools 目录里没有新版的 `ritobin-tools.exe`。
 */
export const ritobinToolPath = (): string =>
  path.join(resolveToolsDir(), 'ritobin', 'bin', RITOBIIN_TOOL_FILE);

/** 随包名字表目录（完整 binfields + bintypes，只在精简表失效时兜底） */
export const ritobinHashTablesDir = (): string =>
  path.join(resolveToolsDir(), 'ritobin', 'bin', 'hashes');

/** 跑一次 ritobin-tools（args 不含可执行文件路径） */
export type RitobinRunner = (args: string[]) => Promise<void>;

/** 一次 ritobin-tools 调用：可执行文件 + 参数 */
export interface RitobinCall {
  command: string;
  args: string[];
}

const HASH_FILE_NAMES = [
  'hashes.binfields.txt',
  'hashes.bintypes.txt',
  'hashes.binentries.txt',
];

let hashDirCache: string | null | undefined;

/**
 * 建（或复用）精简名字表目录。进程内只做一次，失败返回 null（调用方退回完整表）。
 */
export const ensureRitobinHashDir = (): string | null => {
  if (hashDirCache !== undefined) {
    return hashDirCache;
  }
  try {
    const dir = path.join(os.tmpdir(), 'lol-skin-ritobin-hashes');
    fs.mkdirSync(dir, { recursive: true });
    const body = RITOBIIN_NAMES.map((name) => `${ritobinHash(name)} ${name}`).join('\n') + '\n';
    for (const fileName of HASH_FILE_NAMES) {
      const file = path.join(dir, fileName);
      let current = '';
      try {
        current = fs.readFileSync(file, 'utf8');
      } catch {
        // 第一次写
      }
      if (current !== body) {
        fs.writeFileSync(file, body, 'utf8');
      }
    }
    hashDirCache = dir;
  } catch {
    hashDirCache = null;
  }
  return hashDirCache;
};

let noCacheDirCache: string | null | undefined;

/**
 * 空的名字表缓存目录（给 `--hashtable-dir`），让新工具别去读 LTK 的共享缓存，
 * 保证同一份 bin 在装了 / 没装 LTK Manager 的机器上转出来的文本一样。
 */
export const ensureRitobinNoCacheDir = (): string | null => {
  if (noCacheDirCache !== undefined) {
    return noCacheDirCache;
  }
  try {
    const dir = path.join(os.tmpdir(), 'lol-skin-ritobin-nocache');
    fs.mkdirSync(dir, { recursive: true });
    noCacheDirCache = dir;
  } catch {
    noCacheDirCache = null;
  }
  return noCacheDirCache;
};

/** 名字表相关的前置参数：`-H <CDragon 表>` + `--hashtable-dir <空目录>` */
const hashtableArgs = (hashTablesDir: string | null): string[] => {
  const args: string[] = [];
  if (hashTablesDir) {
    args.push('-H', hashTablesDir);
  }
  // 空目录不可用时宁可读共享缓存（只是文本里的名字多少不同，不影响 bin 内容）
  const noCache = ensureRitobinNoCacheDir();
  if (noCache) {
    args.push('--hashtable-dir', noCache);
  }
  return args;
};

/**
 * bin→py 的调用。`recursive` 为 true 时把 *target* 当目录递归转（批量）。
 *
 * `hashTablesDir` 不传就用精简表；传 null 表示不带 `-H`（只用缓存）。
 */
export const binsToPyCall = (
  target: string,
  recursive = false,
  hashTablesDir?: string | null
): RitobinCall => {
  const tables = hashTablesDir === undefined ? ensureRitobinHashDir() : hashTablesDir;
  const args = hashtableArgs(tables);
  args.push('convert', target);
  if (recursive) {
    args.push('-r');
  }
  args.push('--ext', 'py');
  return { command: ritobinToolPath(), args };
};

/** py→bin 的调用（反向不需要名字表） */
export const pyToBinsCall = (target: string, recursive = false): RitobinCall => ({
  command: ritobinToolPath(),
  args: ['convert', target, ...(recursive ? ['-r'] : []), '--to', 'bin'],
});

/** 递归列出目录下指定扩展名的文件 */
const listFiles = (dir: string, extension: string): string[] => {
  const found: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        found.push(full);
      }
    }
  }
  return found;
};

/** 转出来的 py 里有没有我们改写的锚点（没有说明名字表没生效） */
const pysHaveAnchors = (dir: string): boolean => {
  const files = listFiles(dir, '.py');
  if (files.length === 0) {
    return false;
  }
  const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  return text.includes('championSkinName:') && text.includes('SkinCharacterDataProperties');
};

export interface ConvertResult {
  /** 真正转了多少个文件 */
  count: number;
  /** 是否用了精简名字表 */
  slimHashes: boolean;
  /** 用时（毫秒） */
  elapsedMs: number;
}

/**
 * 把目录下所有 `.bin` 转成 `.py`（一次 ritobin-tools 调用，批量）。
 *
 * 精简名字表没解出锚点时，删掉这批 py 换随包完整表再转一次。
 */
export const convertBinsToPy = async (
  run: RitobinRunner,
  dir: string,
  log?: (message: string) => void
): Promise<ConvertResult> => {
  const startedAt = Date.now();
  // builder 7 起，皮肤 bin 的文本要按字段名改写（`idleParticlesEffects` / `keywordsRequired`
  // / `Filtering` 这些没在精简表里）。随包完整表只有 400KB，转换耗时和精简表同量级
  // （191KB 的 bin 约 110ms），所以直接用完整表，别再靠「解不出锚点再重转」兜底。
  const full = ritobinHashTablesDir();
  const slim = ensureRitobinHashDir();
  const attempts: { args: string[]; slim: boolean }[] = [];
  if (fs.existsSync(full)) {
    attempts.push({ args: binsToPyCall(dir, true, full).args, slim: false });
  }
  if (slim) {
    attempts.push({ args: binsToPyCall(dir, true, slim).args, slim: true });
  }
  if (attempts.length === 0) {
    attempts.push({ args: binsToPyCall(dir, true, null).args, slim: false });
  }

  for (let index = 0; index < attempts.length; index++) {
    await run(attempts[index].args);
    if (pysHaveAnchors(dir)) {
      return {
        count: listFiles(dir, '.py').length,
        slimHashes: attempts[index].slim,
        elapsedMs: Date.now() - startedAt,
      };
    }
    if (index < attempts.length - 1) {
      // 完整表没覆盖到（游戏改了字段名？）：删掉这批只有哈希的 py，换精简表再试
      log?.('[ritobin] 完整名字表里没解出锚点，改用精简名字表重转一次');
      for (const file of listFiles(dir, '.py')) {
        fs.rmSync(file, { force: true });
      }
    }
  }
  return { count: listFiles(dir, '.py').length, slimHashes: false, elapsedMs: Date.now() - startedAt };
};

/** 把目录下所有 `.py` 转回 `.bin`（批量，反向不需要名字表） */
export const convertPyToBins = async (run: RitobinRunner, dir: string): Promise<ConvertResult> => {
  const startedAt = Date.now();
  await run(pyToBinsCall(dir, true).args);
  return { count: listFiles(dir, '.bin').length, slimHashes: false, elapsedMs: Date.now() - startedAt };
};
