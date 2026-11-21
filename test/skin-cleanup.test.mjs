/**
 * 「一键清理所有皮肤」的单元测试（不需要游戏、不需要 Electron）。
 *
 * 删除的是 `<皮肤存储路径>/<皮肤目录名称>` 整个目录，路径来自用户手输的配置，
 * 所以重点测两件事：目录名非法/越界时绝不能删；正常清理只动这个目录。
 *
 * 运行：npm run cleanup:test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinCleanup.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先打包 electron/utils/skin-cleanup.ts`);
}
const { clearSkinOutput, formatBytes, inspectSkinOutput, resolveSkinOutputDir } = await import(
  `file:///${BUNDLE.replace(/\\/g, '/')}`
);

let failures = 0;
const step = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`  ok   ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-cleanup-'));
const skinRoot = path.join(tmp, 'skins');
const suffix = 'wad_skins';
const outputDir = path.join(skinRoot, suffix);
const hero1 = path.join(outputDir, '1');
const hero2 = path.join(outputDir, '2');
fs.mkdirSync(path.join(hero1, 'chroma'), { recursive: true });
fs.mkdirSync(hero2, { recursive: true });
const zip1 = path.join(hero1, '1_1.zip');
const zip2 = path.join(hero2, '2_3.zip');
fs.writeFileSync(zip1, Buffer.alloc(100, 1));
fs.writeFileSync(zip2, Buffer.alloc(250, 2));
fs.writeFileSync(`${zip1}.check.json`, '{"ok":true}');
fs.writeFileSync(path.join(hero1, 'chroma', 'note.txt'), 'x');
const outsideDir = path.join(tmp, 'outside');
fs.mkdirSync(outsideDir, { recursive: true });
const outsideFile = path.join(outsideDir, 'keep.zip');
fs.writeFileSync(outsideFile, 'keep me');
const rootSibling = path.join(skinRoot, 'other', 'keep.zip');
fs.mkdirSync(path.dirname(rootSibling), { recursive: true });
fs.writeFileSync(rootSibling, 'keep me too');

console.log('resolveSkinOutputDir');
await step('正常目录名解析到皮肤路径下', () => {
  const resolved = resolveSkinOutputDir(skinRoot, suffix);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.dir, outputDir);
  assert.equal(resolved.suffix, suffix);
});
await step('首尾空格会去掉（和 getSkinDefaultSuffix 一致）', () => {
  const resolved = resolveSkinOutputDir(skinRoot, '  wad_skins  ');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.dir, outputDir);
});
await step('允许中文目录名', () => {
  const resolved = resolveSkinOutputDir(skinRoot, '我的皮肤');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.dir, path.join(skinRoot, '我的皮肤'));
});
for (const [name, reason] of [
  ['', '空名字'],
  ['   ', '全空格'],
  ['.', '当前目录'],
  ['..', '上级目录'],
  ['../outside', '带 .. 的路径'],
  ['a/b', '正斜杠'],
  ['a\\b', '反斜杠'],
  ['C:', '盘符'],
  ['wad_skins.', '结尾的点'],
  ['wad_skins ', '结尾空格在 trim 后变成合法名'],
  ['CON', 'Windows 保留名'],
  ['lpt1', 'Windows 保留名'],
  ['a?b', '非法字符'],
]) {
  if (name === 'wad_skins ') {
    // trim 之后是合法目录名，单独断言
    await step(`目录名 ${JSON.stringify(name)} 去掉空格后合法`, () => {
      const resolved = resolveSkinOutputDir(skinRoot, name);
      assert.equal(resolved.ok, true);
      assert.equal(resolved.suffix, 'wad_skins');
    });
    continue;
  }
  await step(`拒绝${reason}：${JSON.stringify(name)}`, () => {
    const resolved = resolveSkinOutputDir(skinRoot, name);
    assert.equal(resolved.ok, false);
    assert.ok(resolved.error, '必须带错误原因');
  });
}
await step('拒绝控制字符', () => {
  const resolved = resolveSkinOutputDir(skinRoot, 'a\u0001b');
  assert.equal(resolved.ok, false);
  assert.match(resolved.error, /控制字符/);
});
await step('皮肤存储路径为空时拒绝', () => {
  const resolved = resolveSkinOutputDir('', suffix);
  assert.equal(resolved.ok, false);
});

console.log('inspectSkinOutput');
await step('统计文件数 / 大小 / 英雄目录 / zip 数', async () => {
  const info = await inspectSkinOutput(skinRoot, suffix);
  assert.equal(info.ok, true);
  assert.equal(info.exists, true);
  assert.equal(info.dir, outputDir);
  assert.equal(info.files, 4, '3 个 zip 相关文件 + 1 个 txt');
  assert.equal(info.bytes, 100 + 250 + 11 + 1);
  assert.equal(info.heroes, 2);
  assert.equal(info.zips, 2);
});
await step('目录不存在时 exists=false，但名字合法', async () => {
  const info = await inspectSkinOutput(skinRoot, 'not_here');
  assert.equal(info.ok, true);
  assert.equal(info.exists, false);
  assert.equal(info.files, 0);
});
await step('目录名非法时 ok=false 且不返回可删路径', async () => {
  const info = await inspectSkinOutput(skinRoot, '..');
  assert.equal(info.ok, false);
  assert.equal(info.dir, '');
  assert.ok(info.error);
});
await step('目标是文件时拒绝', async () => {
  fs.writeFileSync(path.join(skinRoot, 'a_file'), 'x');
  const info = await inspectSkinOutput(skinRoot, 'a_file');
  assert.equal(info.ok, false);
  assert.equal(info.exists, true);
  assert.match(info.error, /不是文件夹/);
});

console.log('clearSkinOutput');
await step('只删目标目录，同级文件和其它目录不动', async () => {
  const result = await clearSkinOutput(skinRoot, suffix);
  assert.equal(result.ok, true);
  assert.equal(result.removed, true);
  assert.equal(result.files, 4);
  assert.equal(fs.existsSync(outputDir), false, '皮肤目录应被整个删除');
  assert.equal(fs.existsSync(outsideFile), true, '皮肤路径外的文件不能删');
  assert.equal(fs.existsSync(rootSibling), true, '皮肤路径下其它目录不能删');
});
await step('目录已经不在了：removed=false，不报错', async () => {
  const result = await clearSkinOutput(skinRoot, suffix);
  assert.equal(result.ok, true);
  assert.equal(result.removed, false);
});
await step('非法目录名不会删除任何东西', async () => {
  fs.mkdirSync(hero1, { recursive: true });
  fs.writeFileSync(zip1, 'x');
  const result = await clearSkinOutput(skinRoot, '..');
  assert.equal(result.ok, false);
  assert.equal(result.removed, false);
  assert.equal(fs.existsSync(skinRoot), true, '皮肤存储路径本身不能被删');
  assert.equal(fs.existsSync(outputDir), true);
  assert.equal(fs.existsSync(outsideFile), true);
});
await step('目标是文件时拒绝删除', async () => {
  const result = await clearSkinOutput(skinRoot, 'a_file');
  assert.equal(result.ok, false);
  assert.equal(result.removed, false);
  assert.equal(fs.existsSync(path.join(skinRoot, 'a_file')), true);
});

console.log('formatBytes');
await step('常见体积显示', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(999), '999 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(3.94 * 1024 ** 3), '3.9 GB');
  assert.equal(formatBytes(150 * 1024 ** 2), '150 MB');
});

fs.rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.error(`${failures} 个用例失败`);
  process.exit(1);
}
console.log('全部通过');
