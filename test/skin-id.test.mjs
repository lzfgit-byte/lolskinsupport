/**
 * 皮肤 id 换算的测试：列表 id（`<heroId><序号>`）-> 生成用的序号。
 *
 * 运行：node test/skin-id.test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinId.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先打包 electron/export/skin-id.ts`);
}
const { toSkinIndex } = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);

let failures = 0;
const check = (name, fn) => {
  try {
    const detail = fn();
    console.log(`  ok   ${name}${detail ? ` -> ${detail}` : ''}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

check('JarvanIV：59005 -> 5（这就是之前构建失败的 bug）', () => {
  assert.equal(toSkinIndex('59', '59005'), 5);
  return '5';
});

check('Vayne：67011 -> 11', () => {
  assert.equal(toSkinIndex('67', '67011'), 11);
  return '11';
});

check('单字符英雄：1001 -> 1、10000 -> 0', () => {
  assert.equal(toSkinIndex('1', '1001'), 1);
  assert.equal(toSkinIndex('1', '10000'), 0);
});

check('已经是序号也照样能用', () => {
  assert.equal(toSkinIndex('59', '5'), 5);
  assert.equal(toSkinIndex('67', '11'), 11);
});

check('多位英雄 id：10 + 10001 -> 1（不会把中间的 0 吃掉）', () => {
  assert.equal(toSkinIndex('10', '10001'), 1);
});

check('乱码返回 NaN（调用方要报错而不是硬跑）', () => {
  assert.ok(Number.isNaN(toSkinIndex('59', 'abc')));
});

console.log(failures === 0 ? '\n皮肤 id 换算测试通过' : `\n${failures} 个用例失败`);
process.exit(failures === 0 ? 0 : 1);
