/**
 * LeagueSkins 导入 —— 把 `skins/<英雄>/<皮肤>/<皮肤>.fantome` 摊平成
 * `<皮肤目录>/<英雄>/<英雄>_<序号>.zip`。
 *
 * 两种来源，落盘结果完全一致：
 *   1. 整包 zip（`importLeagueSkinsFromZip`）：ZipArchive 只读中央目录，条目逐条
 *      流式解压落盘（先写 .part 再改名），4~5 GB 也不会读进内存；
 *   2. 本地文件夹（`importLeagueSkinsFromFolder`）：用户在「设置」里选
 *      `...\LeagueSkins\skins`（或它上一级），逐个文件复制。
 *
 * 两种来源都按「大小 + CRC32」判断目标文件是否已经一致，一致就只读不写。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { ZipArchive, type ZipEntry } from '../utils/zip-archive';

export interface ImportLeagueSkinsOptions {
  /** 整包 zip 的路径 */
  zipPath: string;
  /** 皮肤库根目录（其下按皮肤目录后缀分目录） */
  skinRoot: string;
  /** 皮肤目录后缀，例如 wad_skins */
  suffix: string;
  /** 日志回调（接到界面的日志面板） */
  log?: (message: string) => void;
}

export interface ImportLeagueSkinsResult {
  canceled: boolean;
  /** 实际写入（含覆盖）的文件数 */
  count: number;
  /** 内容与压缩包一致、没有重写的文件数 */
  skipped: number;
  /** 其中覆盖了已有文件的数量 */
  replaced: number;
  failed: number;
  unrecognized: number;
  outDir: string;
  /** 整体失败原因（例如选的文件夹不是 LeagueSkins 结构、磁盘空间不足） */
  error?: string;
}

/** 目标目录所在盘的剩余空间，读不到就返回 null */
const diskFreeBytes = (dir: string): number | null => {
  try {
    const stats = fs.statfsSync(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
};

/**
 * CRC32（zlib 的实现在 Node 22 才有；类型定义按 Node 18 编译，所以做一层探测）。
 * 没有原生实现时退回到查表版本，慢一些但不影响正确性。
 */
const nativeCrc32 = (zlib as unknown as { crc32?: (data: Buffer, value?: number) => number }).crc32;
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32Js = (data: Buffer, value = 0): number => {
  let crc = (value ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const crc32 = (data: Buffer, value = 0): number =>
  (nativeCrc32 ? nativeCrc32(data, value) : crc32Js(data, value)) >>> 0;

/** 本地文件的 CRC32；读不了返回 null（读不了就当作内容不同，重写一遍） */
const fileCrc32 = async (file: string): Promise<number | null> => {
  let crc = 0;
  try {
    for await (const chunk of fs.createReadStream(file)) {
      crc = crc32(chunk as Buffer, crc);
    }
    return crc >>> 0;
  } catch {
    return null;
  }
};

/**
 * 从条目路径解析出英雄与皮肤序号。
 *
 *   skins/1/1001/1001.fantome        -> { heroId: '1', skinIndex: 1 }
 *   skins/82/82054/82999/82999.fantome -> { heroId: '82', skinIndex: 999 }
 *   classic/60001/1001/1001.fantome  -> null（经典模式的 id 跟游戏里对不上）
 */
export const parseLeagueSkinsEntry = (entryName: string) => {
  const parts = entryName.replace(/\\/g, '/').split('/').filter(Boolean);
  const skinsIndex = parts.findIndex((part) => part.toLowerCase() === 'skins');
  if (skinsIndex < 0 || parts.length < skinsIndex + 4) {
    return null;
  }

  const heroId = parts[skinsIndex + 1];
  const skinFolderId = parts[skinsIndex + 2];
  const fileName = parts[parts.length - 1];
  if (!/^\d+$/.test(heroId) || !/^\d+$/.test(skinFolderId) || !fileName.endsWith('.fantome')) {
    return null;
  }

  const skinFileId = path.basename(fileName, '.fantome');
  const sourceSkinId = /^\d+$/.test(skinFileId) ? skinFileId : skinFolderId;
  const skinIndex = sourceSkinId.startsWith(heroId)
    ? Number(sourceSkinId.slice(heroId.length) || 0)
    : Number(sourceSkinId);

  if (!Number.isFinite(skinIndex)) {
    return null;
  }

  return { heroId, skinIndex };
};

const GB = 1024 * 1024 * 1024;

/** 文件夹导入同时复制的文件数；小文件很多，串行会被建文件/改名开销拖住 */
const FOLDER_COPY_CONCURRENCY = 4;

/** 「内容一致」比对时同时读的文件对数；比对要把源和目标都读完，串行太慢 */
const DEDUPE_CONCURRENCY = 4;

/** 按固定并发跑一遍列表，结果按原顺序返回（单项抛错会中断整批，调用方自己兜住） */
const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) {
        return;
      }
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/** 进度日志的节流：每 500 项或每 2 秒打一行，最后一项必打 */
const PROGRESS_EVERY = 500;
const PROGRESS_INTERVAL_MS = 2000;

/** 从某个时间点到现在过了多少秒，用于日志里的「用时」 */
const secondsSince = (from: number) => `${((Date.now() - from) / 1000).toFixed(1)} 秒`;

/**
 * 长循环的进度日志。
 *
 * 「内容一致」的判断要读源文件和目标文件算 CRC32，整库导入时要读好几个 GB，
 * 这一段以前几十秒没有任何输出，看起来像卡死了；这里按项数 + 时间双阈值打点。
 */
const createProgress = (log: (message: string) => void, prefix: string) => {
  const startedAt = Date.now();
  let lastAt = startedAt;
  let lastDone = -PROGRESS_EVERY;
  return (done: number, total: number, detail: string) => {
    if (total <= 0) {
      return;
    }
    const now = Date.now();
    const final = done >= total;
    if (!final && done - lastDone < PROGRESS_EVERY && now - lastAt < PROGRESS_INTERVAL_MS) {
      return;
    }
    lastAt = now;
    lastDone = done;
    const percent = Math.min(100, Math.floor((done / total) * 100));
    log(
      `${prefix} 进度 ${done}/${total}（${percent}%），${detail}，` +
        `已用 ${((now - startedAt) / 1000).toFixed(1)} 秒`
    );
  };
};

const isDirectory = async (target: string): Promise<boolean> => {
  try {
    return (await fsp.stat(target)).isDirectory();
  } catch {
    return false;
  }
};

/**
 * 找到真正的 `skins` 目录。
 *
 * 用户可能选的是 `D:\projects\LeagueSkins\skins`（目录名就是 skins），也可能选仓库
 * 根目录 `D:\projects\LeagueSkins`（下面有 skins）。其余目录一律不算，避免把英雄
 * 目录、皮肤目录误当成根目录，导出一堆对不上号的皮肤。
 */
export const resolveLeagueSkinsFolder = async (folderPath: string): Promise<string | null> => {
  if (!folderPath) {
    return null;
  }
  const absolute = path.resolve(folderPath);
  if (!(await isDirectory(absolute))) {
    return null;
  }
  if (path.basename(absolute).toLowerCase() === 'skins') {
    return absolute;
  }
  const nested = path.join(absolute, 'skins');
  return (await isDirectory(nested)) ? nested : null;
};

interface FolderFantomeFile {
  /** 源文件完整路径 */
  file: string;
  /** 相对 skins 目录的路径（用 / 分隔） */
  relative: string;
}

/**
 * 递归收集 `skins` 目录下的 .fantome 文件。
 *
 * 不跟随符号链接/目录联接（避免循环）；读不了的目录只记日志并跳过。
 */
const collectFantomeFiles = async (
  skinsDir: string,
  log: (message: string) => void
): Promise<{ files: FolderFantomeFile[]; unreadable: number }> => {
  const files: FolderFantomeFile[] = [];
  const stack: string[] = [''];
  let unreadable = 0;
  while (stack.length > 0) {
    const relativeDir = stack.pop();
    const dir = path.join(skinsDir, relativeDir);
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (error) {
      unreadable++;
      log(
        `[LeagueSkins文件夹导入] 读取目录失败 ${dir}: ${
          (error as NodeJS.ErrnoException)?.message ?? error
        }`
      );
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const relative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        stack.push(relative);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.fantome')) {
        files.push({
          file: path.join(skinsDir, relative),
          relative: relative.replace(/\\/g, '/'),
        });
      }
    }
  }
  // 按路径排序，保证重复目标时和 zip 导入（中央目录顺序）选中同一份
  files.sort((left, right) => left.relative.localeCompare(right.relative));
  return { files, unreadable };
};

/** 复制到 `.part` 再改名，失败不会留下半个文件，也不会破坏已有目标 */
const copyFileAtomic = async (source: string, target: string): Promise<void> => {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.part`;
  try {
    await fsp.copyFile(source, temp);
    await fsp.rename(temp, target);
  } catch (error) {
    await fsp.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
};

export const importLeagueSkinsFromZip = async (
  options: ImportLeagueSkinsOptions
): Promise<ImportLeagueSkinsResult> => {
  const { zipPath, skinRoot, suffix } = options;
  const log = options.log ?? (() => {});
  const outDir = path.join(skinRoot, suffix);

  log(`[LeagueSkins导入] 压缩包: ${zipPath}`);
  log(`[LeagueSkins导入] 目标目录: ${outDir}`);
  const startedAt = Date.now();

  let archive: ZipArchive;
  try {
    archive = await ZipArchive.open(zipPath);
  } catch (error) {
    const message = `读取压缩包失败: ${error?.message ?? error}`;
    log(`[LeagueSkins导入] ${message}`);
    return {
      canceled: false,
      count: 0,
      skipped: 0,
      replaced: 0,
      failed: 0,
      unrecognized: 0,
      outDir,
      error: message,
    };
  }

  // 目标文件 -> 条目，同一个英雄皮肤只留一份
  const plan = new Map<string, { entry: ZipEntry; target: string }>();
  let fantomeCount = 0;
  let unrecognized = 0;
  for (const entry of archive.entries) {
    if (entry.isDirectory || !entry.name.toLowerCase().endsWith('.fantome')) {
      continue;
    }
    fantomeCount++;
    const parsed = parseLeagueSkinsEntry(entry.name);
    if (!parsed) {
      unrecognized++;
      continue;
    }
    const target = path.join(outDir, parsed.heroId, `${parsed.heroId}_${parsed.skinIndex}.zip`);
    plan.set(target, { entry, target });
  }

  // 已存在的按内容比对：大小 + CRC32 都一致才算「已经有了」，否则覆盖
  log('[LeagueSkins导入] 比对已导入的皮肤（大小 + CRC32 一致才算重复，否则覆盖）…');
  let skipped = 0;
  let replaced = 0;
  const checkProgress = createProgress(log, '[LeagueSkins导入] 校验已导入的皮肤');
  let checked = 0;
  const checkedItems = await mapLimit(
    Array.from(plan.values()),
    DEDUPE_CONCURRENCY,
    async (item) => {
      let existingSize = -1;
      try {
        existingSize = fs.statSync(item.target).size;
      } catch {
        // 还没有导入过
      }
      let same = false;
      if (existingSize >= 0) {
        if (existingSize === item.entry.size && item.entry.size > 0) {
          const localCrc = await fileCrc32(item.target);
          same = localCrc !== null && localCrc === item.entry.crc32 >>> 0;
        }
        if (same) {
          skipped++;
        } else {
          replaced++;
        }
      }
      checkProgress(++checked, plan.size, `内容一致 ${skipped} 个，待覆盖 ${replaced} 个`);
      return { item, same, existed: existingSize >= 0 };
    }
  );
  const todo: { entry: ZipEntry; target: string }[] = checkedItems
    .filter((result) => !(result.existed && result.same))
    .map((result) => result.item);

  const bytesNeeded = todo.reduce((sum, item) => sum + item.entry.size, 0);
  const free = diskFreeBytes(fs.existsSync(outDir) ? outDir : skinRoot);
  log(
    `[LeagueSkins导入] fantome ${fantomeCount} 个，可导入 ${plan.size} 个，` +
      `内容一致跳过 ${skipped} 个，待覆盖 ${replaced} 个，` +
      `待写入 ${(bytesNeeded / GB).toFixed(2)} GB${
        free === null ? '' : `，磁盘剩余 ${(free / GB).toFixed(1)} GB`
      }`
  );
  if (unrecognized > 0) {
    log(
      `[LeagueSkins导入] 跳过 ${unrecognized} 个不在 skins/<英雄>/<皮肤>/ 结构里的条目` +
        '（多为 classic 经典模式）'
    );
  }

  // 留 2 GB 余量，避免写到一半把盘塞满
  if (free !== null && bytesNeeded > free - 2 * GB) {
    const message =
      `空间不足：需要约 ${(bytesNeeded / GB).toFixed(1)} GB，` +
      `只剩 ${(free / GB).toFixed(1)} GB`;
    log(`[LeagueSkins导入] ${message}`);
    return {
      canceled: false,
      count: 0,
      skipped,
      replaced,
      failed: 0,
      unrecognized,
      outDir,
      error: message,
    };
  }

  let count = 0;
  let failed = 0;
  const total = todo.length;
  if (total > 0) {
    log(`[LeagueSkins导入] 开始解压 ${total} 个皮肤文件…`);
  }
  for (let index = 0; index < total; index++) {
    const item = todo[index];
    try {
      await archive.extractTo(item.entry, item.target);
      count++;
    } catch (error) {
      failed++;
      log(`[LeagueSkins导入] 失败 ${item.entry.name}: ${error?.message ?? error}`);
    }
    if ((index + 1) % 50 === 0 || index + 1 === total) {
      log(
        `[LeagueSkins导入] 进度 ${index + 1}/${total}，成功 ${count}，失败 ${failed}，` +
          `已用 ${secondsSince(startedAt)}`
      );
    }
  }

  log(
    `[LeagueSkins导入] 完成: 写入 ${count}（覆盖 ${replaced}），内容一致跳过 ${skipped}，` +
      `失败 ${failed}，未识别 ${unrecognized}/${fantomeCount}，用时 ${secondsSince(startedAt)}`
  );

  return { canceled: false, count, skipped, replaced, failed, unrecognized, outDir };
};

export interface ImportLeagueSkinsFolderOptions {
  /** 用户选的文件夹：`...\LeagueSkins\skins` 或包含它的上一级目录 */
  folderPath: string;
  /** 皮肤库根目录（其下按皮肤目录后缀分目录） */
  skinRoot: string;
  /** 皮肤目录后缀，例如 wad_skins */
  suffix: string;
  /** 日志回调（接到界面的日志面板） */
  log?: (message: string) => void;
}

/**
 * 从本地文件夹导入 —— 不需要先把 4~5 GB 的 skins 目录压成 zip。
 *
 * 目录结构：
 *   <folderPath>/skins/<英雄>/<皮肤>/<皮肤>.fantome
 * 也支持直接选到 `skins` 目录本身；落盘目标和整包导入完全一致：
 *   <skinRoot>/<suffix>/<英雄>/<英雄>_<序号>.zip
 */
export const importLeagueSkinsFromFolder = async (
  options: ImportLeagueSkinsFolderOptions
): Promise<ImportLeagueSkinsResult> => {
  const { folderPath, skinRoot, suffix } = options;
  const log = options.log ?? (() => {});
  const outDir = path.join(skinRoot, suffix);

  log(`[LeagueSkins文件夹导入] 选择的文件夹: ${folderPath}`);
  log(`[LeagueSkins文件夹导入] 目标目录: ${outDir}`);
  const startedAt = Date.now();

  const skinsDir = await resolveLeagueSkinsFolder(folderPath);
  if (!skinsDir) {
    const message =
      '选择的文件夹不是 LeagueSkins 结构：请选 skins 文件夹（skin 文件在里层），或它上一级的仓库目录';
    log(`[LeagueSkins文件夹导入] ${message}`);
    return {
      canceled: false,
      count: 0,
      skipped: 0,
      replaced: 0,
      failed: 0,
      unrecognized: 0,
      outDir,
      error: message,
    };
  }
  log(`[LeagueSkins文件夹导入] 皮肤目录: ${skinsDir}`);

  log('[LeagueSkins文件夹导入] 扫描目录，查找 .fantome 文件…');
  const scanStartedAt = Date.now();
  const { files, unreadable } = await collectFantomeFiles(skinsDir, log);
  log(
    `[LeagueSkins文件夹导入] 扫描完成: ${files.length} 个 .fantome 文件，` +
      `用时 ${secondsSince(scanStartedAt)}`
  );
  if (files.length === 0) {
    const message = `skins 目录下没有找到 .fantome 皮肤文件: ${skinsDir}`;
    log(`[LeagueSkins文件夹导入] ${message}`);
    return {
      canceled: false,
      count: 0,
      skipped: 0,
      replaced: 0,
      failed: 0,
      unrecognized: 0,
      outDir,
      error: message,
    };
  }

  // 目标文件 -> 源文件；同一个英雄皮肤只留一份
  const plan = new Map<string, { source: string; size: number }>();
  let unrecognized = 0;
  let duplicates = 0;
  let failed = 0;
  const statProgress = createProgress(log, '[LeagueSkins文件夹导入] 读取文件信息');
  let statDone = 0;
  for (const item of files) {
    const parsed = parseLeagueSkinsEntry(`skins/${item.relative}`);
    if (!parsed) {
      unrecognized++;
      continue;
    }
    const target = path.join(outDir, parsed.heroId, `${parsed.heroId}_${parsed.skinIndex}.zip`);
    try {
      const stat = await fsp.stat(item.file);
      if (plan.has(target)) {
        duplicates++;
      }
      plan.set(target, { source: item.file, size: stat.size });
    } catch (error) {
      failed++;
      log(
        `[LeagueSkins文件夹导入] 读取失败 ${item.file}: ${
          (error as NodeJS.ErrnoException)?.message ?? error
        }`
      );
    }
    statProgress(++statDone, files.length, `已读取 ${plan.size} 个皮肤`);
  }

  // 已存在的按内容比对：大小 + CRC32 都一致才算「已经有了」，否则覆盖
  log('[LeagueSkins文件夹导入] 比对已导入的皮肤（大小 + CRC32 一致才算重复，否则覆盖）…');
  const checkProgress = createProgress(log, '[LeagueSkins文件夹导入] 校验已导入的皮肤');
  let skipped = 0;
  let replaced = 0;
  let checked = 0;
  const checkedItems = await mapLimit(
    Array.from(plan.entries()),
    DEDUPE_CONCURRENCY,
    async ([target, item]) => {
      let existingSize = -1;
      try {
        existingSize = (await fsp.stat(target)).size;
      } catch {
        // 还没有导入过
      }
      let same = false;
      if (existingSize >= 0) {
        if (existingSize === item.size && item.size > 0) {
          const [localCrc, sourceCrc] = await Promise.all([
            fileCrc32(target),
            fileCrc32(item.source),
          ]);
          same = localCrc !== null && sourceCrc !== null && localCrc === sourceCrc;
        }
        if (same) {
          skipped++;
        } else {
          replaced++;
        }
      }
      checkProgress(++checked, plan.size, `内容一致 ${skipped} 个，待覆盖 ${replaced} 个`);
      return { target, item, same, existed: existingSize >= 0 };
    }
  );
  const todo: { target: string; source: string; size: number }[] = checkedItems
    .filter((result) => !(result.existed && result.same))
    .map((result) => ({ target: result.target, ...result.item }));

  const bytesNeeded = todo.reduce((sum, item) => sum + item.size, 0);
  const free = diskFreeBytes(fs.existsSync(outDir) ? outDir : skinRoot);
  log(
    `[LeagueSkins文件夹导入] fantome ${files.length} 个，可导入 ${plan.size} 个，` +
      `内容一致跳过 ${skipped} 个，待覆盖 ${replaced} 个，` +
      `待写入 ${(bytesNeeded / GB).toFixed(2)} GB${
        free === null ? '' : `，磁盘剩余 ${(free / GB).toFixed(1)} GB`
      }`
  );
  if (unrecognized > 0) {
    log(`[LeagueSkins文件夹导入] 跳过 ${unrecognized} 个不在 skins/<英雄>/<皮肤>/ 结构里的文件`);
  }
  if (duplicates > 0) {
    log(
      `[LeagueSkins文件夹导入] ${duplicates} 个文件映射到同一个皮肤（如重复的炫彩），` +
        '只保留扫描到的最后一份'
    );
  }
  if (unreadable > 0) {
    log(`[LeagueSkins文件夹导入] ${unreadable} 个目录读取失败，已跳过`);
  }

  // 留 2 GB 余量，避免写到一半把盘塞满
  if (free !== null && bytesNeeded > free - 2 * GB) {
    const message =
      `空间不足：需要约 ${(bytesNeeded / GB).toFixed(1)} GB，` +
      `只剩 ${(free / GB).toFixed(1)} GB`;
    log(`[LeagueSkins文件夹导入] ${message}`);
    return {
      canceled: false,
      count: 0,
      skipped,
      replaced,
      failed,
      unrecognized,
      outDir,
      error: message,
    };
  }

  let count = 0;
  let bytesCopied = 0;
  let completed = 0;
  const total = todo.length;
  let cursor = 0;
  if (total > 0) {
    log(`[LeagueSkins文件夹导入] 开始复制 ${total} 个皮肤文件…`);
  }
  const copyWorker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= total) {
        return;
      }
      const item = todo[index];
      try {
        await copyFileAtomic(item.source, item.target);
        count++;
        bytesCopied += item.size;
      } catch (error) {
        failed++;
        log(
          `[LeagueSkins文件夹导入] 失败 ${item.source}: ${
            (error as NodeJS.ErrnoException)?.message ?? error
          }`
        );
      }
      completed++;
      if (completed % 50 === 0 || completed === total) {
        log(
          `[LeagueSkins文件夹导入] 进度 ${completed}/${total}，成功 ${count}，失败 ${failed}，` +
            `已写入 ${(bytesCopied / GB).toFixed(2)} GB，已用 ${secondsSince(startedAt)}`
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FOLDER_COPY_CONCURRENCY, total) }, () => copyWorker())
  );

  log(
    `[LeagueSkins文件夹导入] 完成: 写入 ${count}（覆盖 ${replaced}），` +
      `内容一致跳过 ${skipped}，失败 ${failed}，未识别 ${unrecognized}/${files.length}，` +
      `用时 ${secondsSince(startedAt)}`
  );

  return { canceled: false, count, skipped, replaced, failed, unrecognized, outDir };
};
