/**
 * LeagueSkins 整包导入的端到端测试（不依赖 Electron）。
 *
 * 造一个和真实整包同结构的压缩包（skins/<英雄>/<皮肤>/<皮肤>.fantome，另加
 * classic 条目和无关文件），跑一遍导入，检查：
 *   - 文件按 <英雄>/<英雄>_<序号>.zip 落盘，内容逐字节一致；
 *   - classic 等不认识的条目被跳过但计入统计；
 *   - 内容一致（大小 + CRC32）时跳过、不重写；
 *   - 大小相同但内容不同、或大小不同时，覆盖成压缩包里的版本。
 *
 * 运行：node test/league-skins-import.test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'test', '.tmp');
const BUNDLE = path.join(TMP, 'leagueSkinsImport.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先打包 league-skins-import.ts`);
}
const AdmZip = (await import('adm-zip')).default;
const { importLeagueSkinsFromZip, parseLeagueSkinsEntry } = await import(
  `file:///${BUNDLE.replace(/\\/g, '/')}`
);

fs.mkdirSync(TMP, { recursive: true });
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

/** 造一个「像 .fantome 的」小 zip，内容足够区分不同皮肤 */
const fantome = (label) => {
  const zip = new AdmZip();
  zip.addFile('META/info.json', Buffer.from(JSON.stringify({ Name: label })));
  zip.addFile('WAD/Test.wad.client', Buffer.from(`wad-${label}`));
  return zip.toBuffer();
};

const packPath = path.join(TMP, 'league-skins-pack.zip');
const contents = {
  'skins/1/1001/1001.fantome': fantome('annie-1'),
  'skins/1/1002/1002.fantome': fantome('annie-2'),
  'skins/2/2001/2001.fantome': fantome('olaf-1'),
  'skins/82/82054/82999/82999.fantome': fantome('deep-path'),
  'classic/60001/1001/1001.fantome': fantome('classic-skin'),
  'README.md': Buffer.from('# LeagueSkins'),
};
{
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(contents)) {
    zip.addFile(name, data);
  }
  fs.writeFileSync(packPath, zip.toBuffer());
}

const skinRoot = path.join(TMP, 'import-skins');
fs.rmSync(skinRoot, { recursive: true, force: true });
const logs = [];

await check('解析条目路径', async () => {
  assert.deepEqual(parseLeagueSkinsEntry('skins/1/1001/1001.fantome'), {
    heroId: '1',
    skinIndex: 1,
  });
  assert.deepEqual(parseLeagueSkinsEntry('skins/82/82054/82999/82999.fantome'), {
    heroId: '82',
    skinIndex: 999,
  });
  assert.equal(parseLeagueSkinsEntry('classic/60001/1001/1001.fantome'), null);
  assert.equal(parseLeagueSkinsEntry('README.md'), null);
});

await check('首次导入：4 个皮肤落盘，classic 被跳过', async () => {
  const result = await importLeagueSkinsFromZip({
    zipPath: packPath,
    skinRoot,
    suffix: 'wad_skins',
    log: (message) => logs.push(message),
  });
  assert.equal(result.count, 4, `count=${result.count}`);
  assert.equal(result.skipped, 0);
  assert.equal(result.replaced, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.unrecognized, 1, 'classic 应计为未识别');
  return `count=${result.count} unrecognized=${result.unrecognized}`;
});

await check('落盘路径与内容都正确', async () => {
  const outDir = path.join(skinRoot, 'wad_skins');
  const expected = {
    '1/1_1.zip': 'skins/1/1001/1001.fantome',
    '1/1_2.zip': 'skins/1/1002/1002.fantome',
    '2/2_1.zip': 'skins/2/2001/2001.fantome',
    '82/82_999.zip': 'skins/82/82054/82999/82999.fantome',
  };
  for (const [relative, source] of Object.entries(expected)) {
    const file = path.join(outDir, relative);
    assert.ok(fs.existsSync(file), `缺少 ${relative}`);
    assert.deepEqual(fs.readFileSync(file), contents[source], `${relative} 内容不一致`);
    assert.ok(!fs.existsSync(`${file}.part`), '不应留下 .part');
  }
  assert.ok(!fs.existsSync(path.join(outDir, '60001')), 'classic 不应被导入');
  return Object.keys(expected).join(', ');
});

await check('重复导入：内容一致才跳过，不重写', async () => {
  const outDir = path.join(skinRoot, 'wad_skins');
  const before = fs.statSync(path.join(outDir, '1', '1_1.zip')).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const result = await importLeagueSkinsFromZip({
    zipPath: packPath,
    skinRoot,
    suffix: 'wad_skins',
    log: () => {},
  });
  assert.equal(result.count, 0);
  assert.equal(result.skipped, 4);
  assert.equal(result.replaced, 0);
  const after = fs.statSync(path.join(outDir, '1', '1_1.zip')).mtimeMs;
  assert.equal(after, before, '内容一致的文件不该被重写');
  return `skipped=${result.skipped}`;
});

await check('大小相同但内容不同：覆盖', async () => {
  const outDir = path.join(skinRoot, 'wad_skins');
  const target = path.join(outDir, '2', '2_1.zip');
  const original = contents['skins/2/2001/2001.fantome'];
  // 造一个「长度一样、内容不同」的旧文件，模拟被改过/旧版本的皮肤
  const stale = Buffer.alloc(original.length, 0x41);
  assert.equal(stale.length, original.length);
  assert.notDeepEqual(stale, original);
  fs.writeFileSync(target, stale);

  const result = await importLeagueSkinsFromZip({
    zipPath: packPath,
    skinRoot,
    suffix: 'wad_skins',
    log: () => {},
  });
  assert.equal(result.count, 1, '应该重写这一个');
  assert.equal(result.replaced, 1, '应记为覆盖');
  assert.equal(result.skipped, 3);
  assert.deepEqual(fs.readFileSync(target), original, '内容应被压缩包里的版本覆盖');
  return 'overwritten by CRC mismatch';
});

await check('目标大小不一致时覆盖', async () => {
  const outDir = path.join(skinRoot, 'wad_skins');
  const target = path.join(outDir, '1', '1_1.zip');
  fs.writeFileSync(target, Buffer.from('stale'));
  const result = await importLeagueSkinsFromZip({
    zipPath: packPath,
    skinRoot,
    suffix: 'wad_skins',
    log: () => {},
  });
  assert.equal(result.count, 1);
  assert.equal(result.replaced, 1);
  assert.equal(result.skipped, 3);
  assert.deepEqual(fs.readFileSync(target), contents['skins/1/1001/1001.fantome']);
  return 'overwritten';
});

await check('日志里有进度和统计', async () => {
  const text = logs.join('\n');
  assert.match(text, /fantome 5 个/);
  assert.match(text, /进度 4\/4/);
  assert.match(text, /完成/);
});

fs.rmSync(packPath, { force: true });
fs.rmSync(skinRoot, { recursive: true, force: true });

console.log(failures === 0 ? '\nLeagueSkins 导入测试通过' : `\n${failures} 个用例失败`);
process.exit(failures === 0 ? 0 : 1);
