/**
 * ritobin 的批量转换封装。
 *
 * 性能坑：`ritobin_cli` 每次启动都会把 `tools/ritobin/bin/hashes/` 下的名字表
 * 读进内存（`hashes.game.txt` 有 219 MB）。实测 5 KB 的 bin 转一次也要 3.3 s，
 * 1 字节的 bin 只要 10 ms —— 时间全花在名字表上，跟文件大小无关。一个皮肤要转
 * 4 个 bin 就是 12 s。
 *
 * 两条对策（都是对 ritobin 的调用方式，不改它的输出）：
 *
 *   1. **批量**：`-r -i bin <目录>` 一次转完整个目录，名字表只加载一次；
 *   2. **精简名字表**：`-d` 指向一个只含「我们改写要用到的字段名」的小表，
 *      ritobin 就只读这几百字节。实测 4 个 bin 从 3.2 s 降到 51 ms。
 *
 * 为什么精简表不会改坏数据：`-d` 只是让没列进去的名字保持 `0x...` 哈希形式，
 * bin 里存的本来就是哈希，py→bin 时再哈希回同样的值。已用真实 bin 验证
 * `bin→py→bin` 逐字节一致（Vayne Skin11 234728 B / Skin0 57311 B）。
 *
 * 如果哪天游戏改了字段名，锚点就解不出来 —— 这时 `convertBinsToPy` 会删掉
 * 这批 py、退回默认名字表重转，行为与以前一致，只是慢。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 改写逻辑依赖的字段/类型名，必须出现在精简名字表里。
 * `skin-audio.ts` 认 tagEventList / bankUnits / bankPath / events / voiceOver / name，
 * `skin-rebase.ts` 认 championSkinName / skeleton / simpleSkin，
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

/** 跑一次 ritobin_cli（args 不含可执行文件路径） */
export type RitobinRunner = (args: string[]) => Promise<void>;

/**
 * ritobin 只认这几个固定文件名（`hashes.other.txt` 之类会被忽略，实测），
 * 所以同一份内容写三份 —— 字段名、类型名分属不同表，混在一起写最省事。
 */
const HASH_FILE_NAMES = [
  'hashes.binfields.txt',
  'hashes.bintypes.txt',
  'hashes.binentries.txt',
];

let hashDirCache: string | null | undefined;

/**
 * 建（或复用）精简名字表目录。进程内只做一次，失败返回 null（调用方退回默认名字表）。
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
 * 把目录下所有 `.bin` 转成 `.py`（批量，一次 ritobin 调用）。
 *
 * 名字表失效时自动退回默认名字表重转，保证和以前的输出一致。
 */
export const convertBinsToPy = async (
  run: RitobinRunner,
  dir: string,
  log?: (message: string) => void
): Promise<ConvertResult> => {
  const startedAt = Date.now();
  const hashDir = ensureRitobinHashDir();
  if (hashDir) {
    await run(['-r', '-i', 'bin', '-d', hashDir, dir]);
    if (pysHaveAnchors(dir)) {
      return { count: listFiles(dir, '.py').length, slimHashes: true, elapsedMs: Date.now() - startedAt };
    }
    // 精简名字表没覆盖到（游戏改了字段名？）：删掉这批只有哈希的 py，用默认名字表重来
    log?.('[ritobin] 精简名字表里没解出锚点，改用默认名字表重转一次');
    for (const file of listFiles(dir, '.py')) {
      fs.rmSync(file, { force: true });
    }
  }
  await run(['-r', '-i', 'bin', dir]);
  return { count: listFiles(dir, '.py').length, slimHashes: false, elapsedMs: Date.now() - startedAt };
};

/** 把目录下所有 `.py` 转回 `.bin`（批量，反向不需要名字表） */
export const convertPyToBins = async (run: RitobinRunner, dir: string): Promise<ConvertResult> => {
  const startedAt = Date.now();
  await run(['-r', '-i', 'py', dir]);
  return { count: listFiles(dir, '.bin').length, slimHashes: false, elapsedMs: Date.now() - startedAt };
};
