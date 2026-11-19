/**
 * 定向解包的测试（不依赖游戏文件）：自己造一个假 WAD + 假 skinbins-index.txt，
 * 验证「按哈希找到这个 WAD 里有哪些皮肤 bin」和「按原相对路径取出来」。
 *
 * 运行：node test/wad-index.test.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'test', '.tmp');
const INDEX_BUNDLE = path.join(TMP, 'wadIndex.mjs');
const HASH_BUNDLE = path.join(TMP, 'wadHash.mjs');
for (const file of [INDEX_BUNDLE, HASH_BUNDLE]) {
  if (!fs.existsSync(file)) {
    throw new Error(`缺少 ${file}，先打包 electron/export/wad-index.ts 与 electron/utils/wad-hash.ts`);
  }
}

const workDir = path.join(TMP, 'wad-index-fixture');
const cacheDir = path.join(workDir, 'cache');
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(cacheDir, { recursive: true });
process.env.LOL_SKIN_CACHE_DIR = cacheDir;

const { discoverWadSkinBins, buildSkinBinIndex, getCacheDir } = await import(
  `file:///${INDEX_BUNDLE.replace(/\\/g, '/')}`
);
const EXTRACT_BUNDLE = path.join(TMP, 'wadExtract.mjs');
if (!fs.existsSync(EXTRACT_BUNDLE)) {
  throw new Error(`缺少 ${EXTRACT_BUNDLE}，先打包 electron/export/extract-wad-chunks.ts`);
}
const { extractWadFiles, readWadChunkHashes } = await import(
  `file:///${EXTRACT_BUNDLE.replace(/\\/g, '/')}`
);
const { wadPathHash } = await import(`file:///${HASH_BUNDLE.replace(/\\/g, '/')}`);

let failures = 0;
const check = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`  ok   ${name}${detail ? ` -> ${detail}` : ''}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

/** 造一个 v3.4 的 WAD：raw 块，表项 32 字节 */
const buildWad = (chunks) => {
  const headerSize = 4 + 256 + 8 + 4;
  const tableSize = chunks.length * 32;
  const header = Buffer.alloc(headerSize);
  header.write('RW', 0, 'ascii');
  header.writeUInt8(3, 2);
  header.writeUInt8(4, 3);
  header.writeBigUInt64LE(0n, 260);
  header.writeUInt32LE(chunks.length, 268);

  const table = Buffer.alloc(tableSize);
  let offset = headerSize + tableSize;
  chunks.forEach((chunk, index) => {
    const at = index * 32;
    table.writeBigUInt64LE(BigInt(`0x${chunk.hash}`), at);
    table.writeUInt32LE(offset, at + 8);
    table.writeUInt32LE(chunk.data.length, at + 12);
    table.writeUInt32LE(chunk.data.length, at + 16);
    table.writeUInt8(0, at + 20); // Raw
    table.writeUInt8(0, at + 21);
    table.writeUInt16LE(0, at + 22);
    table.writeBigUInt64LE(0n, at + 24);
    offset += chunk.data.length;
  });
  return Buffer.concat([header, table, ...chunks.map((chunk) => chunk.data)]);
};

// 假索引：四个角色目录，只有一部分在 WAD 里；再混一条非皮肤 bin 的路径
const allPaths = [
  'data/characters/vayne/skins/skin0.bin',
  'data/characters/vayne/skins/skin11.bin',
  'data/characters/jade_vayne/skins/skin0.bin',
  'data/characters/annietibbers/skins/skin0.bin',
  'data/characters/ahri/skins/skin0.bin',
  'data/characters/vayne/skins/skin0.py',
];
/** 在 WAD 里的路径 */
const present = new Set([
  'data/characters/vayne/skins/skin0.bin',
  'data/characters/vayne/skins/skin11.bin',
  'data/characters/jade_vayne/skins/skin0.bin',
]);

const skinBinIndexPath = path.join(workDir, 'skinbins-index.txt');
const wadPath = path.join(workDir, 'Fake.wad.client');
const chunks = [];
const lines = [];
for (const filePath of allPaths) {
  const hash = wadPathHash(filePath);
  lines.push(`${hash} ${filePath}`);
  if (present.has(filePath)) {
    chunks.push({ hash, data: Buffer.from(`content of ${filePath}`) });
  }
}
// 混一个不在索引里的块，确认不会被误取
chunks.push({ hash: wadPathHash('assets/characters/vayne/skins/base/vayne.skn'), data: Buffer.from('mesh') });
// 索引文件带 # 注释头（生成时间 / 来源），解析时要跳过
fs.writeFileSync(
  skinBinIndexPath,
  ['# skinbins-index: for test', '# generated: 2026-11-19T00:00:00Z', ...lines].join('\n') + '\n',
  'utf8'
);
fs.writeFileSync(wadPath, buildWad(chunks));

await check('缓存目录可以改到测试目录', () => {
  assert.equal(getCacheDir(), cacheDir);
});

await check('索引只留 data/characters/*/skins/skin<n>.bin', () => {
  const index = buildSkinBinIndex(skinBinIndexPath);
  const paths = index.map((entry) => entry.filePath).sort();
  assert.deepEqual(paths, allPaths.filter((p) => p.endsWith('.bin')).sort());
  assert.ok(index.every((entry) => /^[0-9a-f]{16}$/.test(entry.hash)), '哈希格式不对');
  return `${index.length} 条`;
});

await check('读 WAD 目录只拿哈希，不碰数据区', async () => {
  const hashes = await readWadChunkHashes(wadPath);
  assert.equal(hashes.size, chunks.length);
  return `${hashes.size} 个块`;
});

await check('只探出这个 WAD 里真正有的皮肤 bin', async () => {
  const entries = await discoverWadSkinBins({ wadPath, skinBinIndexPath });
  const paths = entries.map((entry) => entry.filePath).sort();
  assert.deepEqual(paths, [...present].sort(), `多/少了: ${paths.join(', ')}`);
  return `${entries.length} 个`;
});

await check('再查一次走缓存', async () => {
  const before = Date.now();
  const entries = await discoverWadSkinBins({ wadPath, skinBinIndexPath });
  assert.equal(entries.length, present.size);
  const files = fs.readdirSync(cacheDir);
  assert.ok(files.some((name) => name.startsWith('wad-fake.wad.client-')), '应该有 WAD 缓存');
  assert.ok(files.some((name) => name.startsWith('skinbins-')), '应该有索引缓存');
  return `${Date.now() - before}ms`;
});

await check('按路径取文件：不同角色同名的 skin0.bin 不会互相覆盖', async () => {
  const entries = await discoverWadSkinBins({ wadPath, skinBinIndexPath });
  const outDir = path.join(workDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const result = await extractWadFiles({ wadPath, files: entries, outputDir: outDir });
  assert.equal(result.success, true);
  for (const filePath of present) {
    const file = path.join(outDir, ...filePath.split('/'));
    assert.ok(fs.existsSync(file), `缺少 ${filePath}`);
    assert.equal(fs.readFileSync(file, 'utf8'), `content of ${filePath}`);
  }
  return `${result.files.length} 个文件`;
});

await check('WAD 里没有皮肤 bin 时返回空数组（调用方退回全量解包）', async () => {
  const emptyWad = path.join(workDir, 'Empty.wad.client');
  fs.writeFileSync(emptyWad, buildWad([{ hash: wadPathHash('assets/foo.tex'), data: Buffer.from('x') }]));
  const entries = await discoverWadSkinBins({ wadPath: emptyWad, skinBinIndexPath });
  assert.equal(entries.length, 0);
  return '空数组';
});

console.log(failures === 0 ? '\nWAD 定向解包测试通过' : `\n${failures} 个用例失败`);
process.exit(failures === 0 ? 0 : 1);
