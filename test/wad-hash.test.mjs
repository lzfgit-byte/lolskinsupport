/**
 * WAD 路径哈希（xxHash64）的测试：结果必须和 hashes.game.txt 里的值一致。
 *
 * 运行：npm run hash:test
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'wadHash.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run hash:test 的构建步骤`);
}

const { wadPathHash } = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);

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

// 已知值来自 %LOCALAPPDATA%\lol-skin-ll\tools\hashes.game.txt
const known = {
  'assets/characters/vayne/skins/skin11/vayne_skin11.skn': '2ea9363d9a0e10b9',
  'assets/characters/vayne/skins/skin11/vayne_skin11.skl': '16f78e2e1d7724aa',
  'assets/augments/particles/15.kiwi_s2_2026_augments.tex': 'ff26edf65b798ac0',
  'assets/augments/particles/15.tex': 'd01706a490cc0edd',
};

step('与 hashes.game.txt 的已知值一致', () => {
  for (const [filePath, expected] of Object.entries(known)) {
    assert.equal(wadPathHash(filePath), expected, filePath);
  }
  return `${Object.keys(known).length} 条`;
});

step('大小写、反斜杠都不影响结果', () => {
  const base = 'assets/characters/vayne/skins/skin11/vayne_skin11.skn';
  const expected = wadPathHash(base);
  assert.equal(wadPathHash(base.toUpperCase()), expected);
  assert.equal(wadPathHash(base.replace(/\//g, '\\')), expected);
  return expected;
});

step('不同路径得到不同哈希', () => {
  const a = wadPathHash('data/characters/vayne/skins/skin0.bin');
  const b = wadPathHash('data/characters/vayne/skins/skin11.bin');
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
  return `${a} / ${b}`;
});

console.log(failures === 0 ? '\nWAD 路径哈希测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
