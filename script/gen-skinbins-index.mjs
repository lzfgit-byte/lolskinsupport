#!/usr/bin/env node
/**
 * 重新生成 `native/tools/skinbins-index.txt`（游戏更新后要重跑这个）。
 *
 * 这个索引是「所有 `data/characters/<角色>/skins/skin<n>.bin` 的路径 + WAD 路径哈希」，
 * 从游戏的 `hashes.game.txt`（219 MB 的文本）里筛出来，22662 条 / 1.32 MB。
 * 随包带上它之后：安装包不用带 219 MB 的名字表，构建皮肤时也不用每次解析 2.5 s
 * （见 electron/export/wad-index.ts）。
 *
 * `hashes.game.txt` 会随游戏版本更新（新英雄/新皮肤都在里面）。更新步骤：
 *
 *   1. 拿到新的 `hashes.game.txt`（cslol-manager 的 cslol-tools 包，
 *      或你本地旧工具目录 `%LOCALAPPDATA%\lol-skin-ll\tools` 里的那份被覆盖后）；
 *   2. `npm run index:gen -- D:\path\to\hashes.game.txt`（也可以给一个目录，
 *      脚本会在里面找 `hashes.game.txt`）；
 *   3. 看输出的「新增 / 删除」条数，`npm run wadindex:test`，再随便构建一个皮肤验证。
 *
 * 只认 `hashes.game.txt`：`hashes.lcu.txt` 是客户端路径的名字表，皮肤 bin 用不到。
 *
 * 用法：
 *   node script/gen-skinbins-index.mjs [hashes.game.txt | 目录]
 *
 * 不给参数时依次找：
 *   %LOCALAPPDATA%\lol-skin-ll\tools\ritobin\bin\hashes\hashes.game.txt
 *   %LOCALAPPDATA%\lol-skin-ll\tools\hashes.game.txt
 *   <仓库>\.tmp\hashes.game.txt
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outPath = path.join(root, 'native', 'tools', 'skinbins-index.txt');
const SKIN_BIN_PATTERN = /^data\/characters\/[^/]+\/skins\/skin\d+\.bin$/;
const MAX_EXAMPLES = 5;

const userData = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'lol-skin-ll');
// `node script/... -- <路径>` 和 `npm run index:gen -- <路径>` 都会把 `--` 传进来，
// 这里直接忽略它（以及其它以 - 开头的开关）
const cliArgs = process.argv.slice(2).filter((item) => item !== '--' && !item.startsWith('-'));
const arg = cliArgs[0];

/** 参数是目录时，在里面找 hashes.game.txt（最多下探 5 层） */
const findInDir = (dir) => {
  const stack = [{ dir, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const hit = entries.find((entry) => entry.isFile() && entry.name === 'hashes.game.txt');
    if (hit) {
      return path.join(current.dir, hit.name);
    }
    if (current.depth < 5) {
      for (const entry of entries) {
        if (entry.isDirectory()) {
          stack.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
        }
      }
    }
  }
  return null;
};

const resolveSource = () => {
  if (arg) {
    const absolute = path.resolve(arg);
    if (!fs.existsSync(absolute)) {
      return null;
    }
    return fs.statSync(absolute).isDirectory() ? findInDir(absolute) : absolute;
  }
  const candidates = [
    path.join(userData, 'tools', 'ritobin', 'bin', 'hashes', 'hashes.game.txt'),
    path.join(userData, 'tools', 'hashes.game.txt'),
    path.join(root, '.tmp', 'hashes.game.txt'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const readEntries = (file) => {
  const entries = [];
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const space = line.indexOf(' ');
    if (space <= 0) {
      continue;
    }
    const filePath = line
      .slice(space + 1)
      .replace(/\\/g, '/')
      .toLowerCase()
      .trim();
    if (SKIN_BIN_PATTERN.test(filePath)) {
      entries.push({ hash: line.slice(0, space).toLowerCase(), filePath });
    }
  }
  entries.sort((left, right) => left.filePath.localeCompare(right.filePath));
  return entries;
};

const source = resolveSource();
if (!source) {
  console.error('[index] 找不到 hashes.game.txt');
  if (arg) {
    console.error(`[index] 参数指向的路径里没有：${path.resolve(arg)}`);
  }
  console.error('[index] 用法：node script/gen-skinbins-index.mjs <hashes.game.txt | 目录>');
  process.exit(1);
}

const sourceStat = fs.statSync(source);
const startedAt = Date.now();
const entries = readEntries(source);
if (entries.length === 0) {
  console.error(`[index] ${source} 里一条皮肤 bin 都没有，拒绝写入（可能不是 hashes.game.txt）`);
  process.exit(1);
}

const badHash = entries.find((entry) => !/^[0-9a-f]{16}$/.test(entry.hash));
if (badHash) {
  console.error(`[index] 哈希格式不对：${badHash.hash} ${badHash.filePath}`);
  process.exit(1);
}

const previous = fs.existsSync(outPath) ? readEntries(outPath) : [];
const previousPaths = new Set(previous.map((entry) => entry.filePath));
const nextPaths = new Set(entries.map((entry) => entry.filePath));
const added = [...nextPaths].filter((filePath) => !previousPaths.has(filePath));
const removed = [...previousPaths].filter((filePath) => !nextPaths.has(filePath));

const stamp = new Date().toISOString();
const header = [
  `# skinbins-index: ${entries.length} 条`,
  `# source: ${path.basename(source)} (${sourceStat.size} bytes, mtime ${sourceStat.mtime.toISOString()})`,
  `# generated: ${stamp}`,
];
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  `${header.join('\n')}\n${entries.map((entry) => `${entry.hash} ${entry.filePath}`).join('\n')}\n`,
  'utf8'
);

const sample = (list) =>
  list
    .slice(0, MAX_EXAMPLES)
    .map((filePath) => `    + ${filePath}`)
    .join('\n');
console.log(
  `[index] ${entries.length} 条 / ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB` +
    ` <- ${source}（${Date.now() - startedAt} ms）`
);
if (previous.length > 0) {
  console.log(`[index] 相比上一版：新增 ${added.length} 条，删除 ${removed.length} 条`);
  if (added.length > 0) {
    console.log(sample(added));
    if (added.length > MAX_EXAMPLES) {
      console.log(`    …还有 ${added.length - MAX_EXAMPLES} 条`);
    }
  }
  if (removed.length > 0) {
    console.log(
      `[index] 注意：删掉了 ${removed.length} 条（如果新表比旧表小很多，可能拿错了文件）`
    );
  }
} else {
  console.log('[index] 之前没有索引，这是第一次生成');
}
console.log(`[index] 已写入 ${outPath}`);
console.log('[index] 下一步：npm run wadindex:test，再构建一个皮肤确认');
