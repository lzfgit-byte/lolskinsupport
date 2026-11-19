/**
 * 英雄 WAD 里「皮肤 bin」的定位。
 *
 * 生成一个皮肤其实只要 `data/characters/<角色>/skins/skin<N>.bin` 这几个小文件
 * （几十 KB），但以前是调 `wad-extract.exe` 把整个英雄 WAD 全解开 —— Vayne 是
 * 144 MB 的 WAD、解出 503 MB 落盘再删掉，光这一步 5.6 s。
 *
 * 做法：
 *
 *   1. WAD 目录里只有路径哈希，所以「哪些路径在这个 WAD 里」= 路径哈希命中；
 *   2. 候选路径来自工具目录里随包的 `skinbins-index.txt`：从游戏的
 *      `hashes.game.txt`（219 MB）筛出所有 `data/characters/<角色>/skins/skin<n>.bin`
 *      （路径 + 哈希，22662 条 / 1.32 MB）。这份索引进安装包，所以既不用带 219 MB
 *      的名字表，也不用每次解析 2.5 s；
 *   3. 用 WAD 的 chunk 哈希表（只读前 100 KB）过一遍，剩下的就是这个 WAD
 *      真正包含的皮肤 bin。
 *
 * 索引随游戏版本更新：新英雄/新皮肤找不到时，用 `npm run index:gen` 从一份新的
 * `hashes.game.txt` 重新生成（脚本见 `script/gen-skinbins-index.mjs`）。
 *
 * 不做「按英雄名猜角色目录」的过滤：安妮的 WAD 里还有 `annietibbers`、
 * `jade_annie_tibbers` 这种名字里不含完整英雄名的角色，猜会漏。
 *
 * 缓存都放系统临时目录（纯派生物，不碰用户数据）：`%TEMP%\lol-skin-cache\`。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readWadChunkHashes } from './extract-wad-chunks';

/** 一条「皮肤 bin 路径 + WAD 路径哈希」 */
export interface SkinBinEntry {
  filePath: string;
  hash: string;
}

const INDEX_VERSION = 2;
const SKIN_BIN_PATTERN = /^data\/characters\/[^/]+\/skins\/skin\d+\.bin$/;

/** 派生物缓存目录：系统临时目录，不写用户数据（测试可用 LOL_SKIN_CACHE_DIR 改） */
export const getCacheDir = (): string => {
  const dir = process.env.LOL_SKIN_CACHE_DIR || path.join(os.tmpdir(), 'lol-skin-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const cacheFile = (name: string): string => path.join(getCacheDir(), name);

/**
 * 读皮肤 bin 索引（`<16 位路径哈希> <相对路径>` 每行一条）。
 *
 * 索引是随包的现成文件（22662 条 / 1.32 MB），这里只是按文件大小 + 修改时间缓存一份
 * 解析结果；万一传进来的是完整的 `hashes.game.txt`，也照样能筛（只是慢一点）。
 */
export const buildSkinBinIndex = (
  skinBinIndexPath: string,
  log?: (message: string) => void
): SkinBinEntry[] => {
  const stat = fs.statSync(skinBinIndexPath);
  const cache = cacheFile(`skinbins-${INDEX_VERSION}-${stat.size}-${Math.round(stat.mtimeMs)}.txt`);
  if (fs.existsSync(cache)) {
    const entries: SkinBinEntry[] = [];
    for (const line of fs.readFileSync(cache, 'utf8').split('\n')) {
      if (line.length === 0) {
        continue;
      }
      const space = line.indexOf(' ');
      if (space > 0) {
        entries.push({ hash: line.slice(0, space), filePath: line.slice(space + 1) });
      }
    }
    return entries;
  }

  const startedAt = Date.now();
  const content = fs.readFileSync(skinBinIndexPath, 'utf8');
  const entries: SkinBinEntry[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    // 索引文件前三行是 # 注释（生成时间 / 来源），不是条目
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const space = line.indexOf(' ');
    if (space <= 0) {
      continue;
    }
    const filePath = line.slice(space + 1).replace(/\\/g, '/').toLowerCase().trim();
    if (SKIN_BIN_PATTERN.test(filePath)) {
      entries.push({ hash: line.slice(0, space).toLowerCase(), filePath });
    }
  }
  entries.sort((left, right) => left.filePath.localeCompare(right.filePath));
  try {
    fs.writeFileSync(
      cache,
      entries.map((entry) => `${entry.hash} ${entry.filePath}`).join('\n') + '\n',
      'utf8'
    );
  } catch {
    // 缓存写失败不影响功能，下次再建
  }
  log?.(`[wad-index] 皮肤 bin 索引: ${entries.length} 条，用时 ${Date.now() - startedAt} ms`);
  return entries;
};

/**
 * 找出某个英雄 WAD 里所有的皮肤 bin。
 *
 * 返回空数组表示「一个都没对上」，调用方应退回全量解包。
 */
export const discoverWadSkinBins = async (options: {
  wadPath: string;
  /** 随包的 `skinbins-index.txt`（见 electron/utils/tools-path.ts） */
  skinBinIndexPath: string;
  log?: (message: string) => void;
}): Promise<SkinBinEntry[]> => {
  const { wadPath, skinBinIndexPath } = options;

  const wadStat = fs.statSync(wadPath);
  const cache = cacheFile(
    `wad-${path.basename(wadPath).toLowerCase()}-${wadStat.size}-${Math.round(wadStat.mtimeMs)}.json`
  );
  if (fs.existsSync(cache)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cache, 'utf8')) as {
        version?: number;
        entries?: SkinBinEntry[];
      };
      if (cached.version === INDEX_VERSION && Array.isArray(cached.entries)) {
        return cached.entries;
      }
    } catch {
      // 缓存坏了就重建
    }
  }

  const startedAt = Date.now();
  const index = buildSkinBinIndex(skinBinIndexPath, options.log);
  const wadHashes = await readWadChunkHashes(wadPath);
  const entries = index.filter((entry) => wadHashes.has(entry.hash));
  if (entries.length === 0) {
    options.log?.(
      `[wad-index] ${path.basename(wadPath)} 里没探到皮肤 bin（皮肤索引可能过期，` +
        `用 npm run index:gen 重新生成），退回全量解包`
    );
    return [];
  }

  try {
    fs.writeFileSync(cache, JSON.stringify({ version: INDEX_VERSION, entries }), 'utf8');
  } catch {
    // 缓存写失败不影响功能
  }
  options.log?.(
    `[wad-index] ${path.basename(wadPath)} 探到 ${entries.length} 个皮肤 bin，` +
      `用时 ${Date.now() - startedAt} ms`
  );
  return entries;
};
