/**
 * 皮肤包删除逻辑的单元测试（不需要游戏、不需要 Electron）。
 *
 * 「构建并注入」强制重建前会删掉上一次的 zip（和旁边的 `.check.json`）；
 * 路径是拼接出来的，删错地方代价太大，所以范围判断单独测。
 *
 * 运行：npm run archive:test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinArchive.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先打包 electron/utils/skin-archive.ts`);
}
const { isUnderDir, removeFilesUnder } = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-archive-'));
const skins = path.join(tmp, 'skins');
const heroDir = path.join(skins, 'wad_skins', '68');
const zip = path.join(heroDir, '68_3.zip');
const check = `${zip}.check.json`;
fs.mkdirSync(heroDir, { recursive: true });
fs.writeFileSync(zip, 'zip');
fs.writeFileSync(check, '{}');

console.log('isUnderDir');
step('子目录里的文件算在里面', () => {
  assert.equal(isUnderDir(zip, skins), true);
  assert.equal(isUnderDir(path.join(skins, 'a', 'b', 'c.zip'), skins), true);
});
step('同级 / 上级 / 自己都不算', () => {
  assert.equal(isUnderDir(path.join(tmp, 'other.zip'), skins), false);
  assert.equal(isUnderDir(skins, skins), false);
  assert.equal(isUnderDir(tmp, skins), false);
});
step('.. 跳出去的不算', () => {
  assert.equal(isUnderDir(path.join(skins, '..', '68_3.zip'), skins), false);
  assert.equal(isUnderDir(path.join(skins, '..', '..', '68_3.zip'), skins), false);
});
step('另一盘的绝对路径不算', () => {
  // Windows 上 Path.relative 跨盘会直接返回绝对路径
  const otherDrive = process.platform === 'win32' ? 'Z:\\nope\\68_3.zip' : '/nope/68_3.zip';
  assert.equal(isUnderDir(otherDrive, skins), false);
});
step('大小写不同的同一路径算在里面', () => {
  if (process.platform !== 'win32') {
    return '跳过（只有 Windows 不区分大小写）';
  }
  assert.equal(isUnderDir(zip.toUpperCase(), skins.toLowerCase()), true);
});

console.log('removeFilesUnder');
step('只删皮肤目录里的文件', () => {
  const outside = path.join(tmp, 'outside.zip');
  fs.writeFileSync(outside, 'keep me');
  const removed = removeFilesUnder(skins, [zip, check, outside]);
  assert.equal(removed, 2);
  assert.equal(fs.existsSync(zip), false);
  assert.equal(fs.existsSync(check), false);
  assert.equal(fs.existsSync(outside), true, '皮肤目录外的文件不能被删');
  fs.rmSync(outside, { force: true });
});
step('不存在的文件不算删除数', () => {
  assert.equal(removeFilesUnder(skins, [zip, check]), 0);
});
step('目录里的目录不会被当成文件删掉', () => {
  const dir = path.join(heroDir, 'sub');
  fs.mkdirSync(dir, { recursive: true });
  // 强行传一个目录：existsSync 为真，rmSync 在 Windows 上会抛；这里只要求不静默吞掉
  assert.throws(() => removeFilesUnder(skins, [dir]));
  fs.rmSync(dir, { recursive: true, force: true });
});

fs.rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.error(`${failures} 个用例失败`);
  process.exit(1);
}
console.log('全部通过');
