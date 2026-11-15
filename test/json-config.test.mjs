/**
 * config.json 安全读写的测试（不碰真实用户目录）：
 * BOM 容忍、坏文件先备份不覆盖、原子写、改键不丢其它键。
 *
 * 运行：npm run config:test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'jsonConfig.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run config:test 的构建步骤`);
}

const { readJsonConfig, writeJsonConfig, patchJsonConfig, stripBom } = await import(
  `file:///${BUNDLE.replace(/\\/g, '/')}`
);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-config-'));
const file = (name) => path.join(dir, name);
const backupsOf = (target) =>
  fs.readdirSync(dir).filter((item) => item.startsWith(path.basename(target) + '.broken-'));

let failures = 0;
const step = (name, fn) => {
  try {
    const detail = fn();
    console.log(`  ok   ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

step('普通读写：UTF-8 无 BOM，内容一致', () => {
  const target = file('plain.json');
  writeJsonConfig(target, { SKIN_DEFAULT_SUFFIX: 'wad_skins', HERO_SKIN: '{"8":"8039"}' });
  const bytes = fs.readFileSync(target);
  assert.equal(bytes[0], 0x7b, '文件应以 { 开头（不能有 BOM）');
  const parsed = readJsonConfig(target);
  assert.equal(parsed.SKIN_DEFAULT_SUFFIX, 'wad_skins');
  assert.equal(parsed.HERO_SKIN, '{"8":"8039"}');
  return `${bytes.length} bytes`;
});

step('带 BOM 的配置能正常读出来（以前会整份丢失）', () => {
  const target = file('bom.json');
  fs.writeFileSync(target, '\uFEFF{"HERO_SKIN":"{\\"8\\":\\"8039\\"}","SKIN_DEFAULT_SUFFIX":"wad_skins"}', 'utf-8');
  const parsed = readJsonConfig(target);
  assert.equal(parsed.SKIN_DEFAULT_SUFFIX, 'wad_skins');
  assert.equal(JSON.parse(parsed.HERO_SKIN)['8'], '8039');
  assert.equal(backupsOf(target).length, 0, 'BOM 不算坏文件，不该备份');
  return 'BOM stripped';
});

step('带 BOM 时改一个键，其它键都保留', () => {
  const target = file('bom-patch.json');
  fs.writeFileSync(target, '\uFEFF{"A":"1","B":"2","C":"3"}', 'utf-8');
  patchJsonConfig(target, { LOCALE_WATCHER_ENABLED: 'false' });
  const parsed = JSON.parse(fs.readFileSync(target, 'utf-8'));
  assert.deepEqual(parsed, { A: '1', B: '2', C: '3', LOCALE_WATCHER_ENABLED: 'false' });
  assert.equal(fs.readFileSync(target)[0], 0x7b, '改写后不应带 BOM');
  return 'A/B/C kept';
});

step('坏 JSON：先备份，不覆盖原文件', () => {
  const target = file('broken.json');
  const broken = '{ "A": "1", oops';
  fs.writeFileSync(target, broken, 'utf-8');
  assert.deepEqual(readJsonConfig(target), {});
  const backups = backupsOf(target);
  assert.equal(backups.length, 1, `应该有 1 份备份，实际 ${backups.length}`);
  assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf-8'), broken, '备份内容应与原文件一致');
  assert.equal(fs.readFileSync(target, 'utf-8'), broken, '原文件不该被读取动作改掉');
  return backups[0];
});

step('坏 JSON 上改键：备份还在，只写回新键', () => {
  const target = file('broken-patch.json');
  fs.writeFileSync(target, 'not json at all', 'utf-8');
  patchJsonConfig(target, { SKIN_DEFAULT_SUFFIX: 'leagueSkins' });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf-8')), { SKIN_DEFAULT_SUFFIX: 'leagueSkins' });
  assert.equal(backupsOf(target).length, 1);
  return 'backup kept';
});

step('空文件 / 不存在的文件都当空配置', () => {
  const empty = file('empty.json');
  fs.writeFileSync(empty, '   \n', 'utf-8');
  assert.deepEqual(readJsonConfig(empty), {});
  assert.deepEqual(readJsonConfig(file('nope.json')), {});
  return 'ok';
});

step('写入是原子的：不留下 .tmp', () => {
  const target = file('atomic.json');
  writeJsonConfig(target, { X: 1 });
  writeJsonConfig(target, { X: 2 });
  const leftovers = fs.readdirSync(dir).filter((item) => item.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
  assert.equal(readJsonConfig(target).X, 2);
  return 'no .tmp';
});

step('stripBom 只去 BOM', () => {
  assert.equal(stripBom('\uFEFF{}'), '{}');
  assert.equal(stripBom('{}'), '{}');
  return 'ok';
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? '\n配置读写测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
