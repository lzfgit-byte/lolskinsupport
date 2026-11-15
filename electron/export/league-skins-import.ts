/**
 * LeagueSkins 整包导入 —— 把 `skins/<英雄>/<皮肤>/<皮肤>.fantome` 摊平成
 * `<皮肤目录>/<英雄>/<英雄>_<序号>.zip`。
 *
 * 整包通常 4~5 GB、上万条目，所以只做流式处理：ZipArchive 只读中央目录，条目
 * 逐条流式解压落盘（先写 .part 再改名），内存占用与压缩包大小无关。
 */

import fs from 'node:fs';
import path from 'node:path';
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
  count: number;
  skipped: number;
  failed: number;
  unrecognized: number;
  outDir: string;
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

export const importLeagueSkinsFromZip = async (
  options: ImportLeagueSkinsOptions
): Promise<ImportLeagueSkinsResult> => {
  const { zipPath, skinRoot, suffix } = options;
  const log = options.log ?? (() => {});
  const outDir = path.join(skinRoot, suffix);

  log(`[LeagueSkins导入] 压缩包: ${zipPath}`);
  log(`[LeagueSkins导入] 目标目录: ${outDir}`);

  let archive: ZipArchive;
  try {
    archive = await ZipArchive.open(zipPath);
  } catch (error) {
    log(`[LeagueSkins导入] 读取压缩包失败: ${error?.message ?? error}`);
    return { canceled: false, count: 0, skipped: 0, failed: 0, unrecognized: 0, outDir };
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

  // 已经导入过（大小一致）的跳过
  const todo: { entry: ZipEntry; target: string }[] = [];
  let skipped = 0;
  for (const item of plan.values()) {
    let existing = -1;
    try {
      existing = fs.statSync(item.target).size;
    } catch {
      // 还没有导入过
    }
    if (existing === item.entry.size && item.entry.size > 0) {
      skipped++;
      continue;
    }
    todo.push(item);
  }

  const bytesNeeded = todo.reduce((sum, item) => sum + item.entry.size, 0);
  const free = diskFreeBytes(fs.existsSync(outDir) ? outDir : skinRoot);
  log(
    `[LeagueSkins导入] fantome ${fantomeCount} 个，可导入 ${plan.size} 个，` +
      `已存在 ${skipped} 个，待写入 ${(bytesNeeded / GB).toFixed(2)} GB${
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
    return { canceled: false, count: 0, skipped, failed: 0, unrecognized, outDir };
  }

  let count = 0;
  let failed = 0;
  const total = todo.length;
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
      log(`[LeagueSkins导入] 进度 ${index + 1}/${total}，成功 ${count}，失败 ${failed}`);
    }
  }

  log(
    `[LeagueSkins导入] 完成: 成功 ${count}，已存在 ${skipped}，失败 ${failed}，` +
      `未识别 ${unrecognized}/${fantomeCount}`
  );

  return { canceled: false, count, skipped, failed, unrecognized, outDir };
};
