/**
 * SKN/SKL 重建的单元测试（不需要游戏和 cslol-tools）。
 *
 * 期望的 sha256 来自 Rose 1.5.9 的 `injection/baseskin/mesh.py` 对同一批 fixture
 * 的输出（fixture 见 test/mesh-fixtures.mjs，照 Rose 的 mesh_fixtures.py 移植）。
 * 字节完全一致才说明移植没走样 —— 重建过的文件会被 LTK 的 patcher 当成「不是别的
 * 皮肤」，差一个字节就可能又变成 skinhack。
 *
 * 运行：npm run mesh:test
 */

import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CASES, GOLDEN, meshModule } from './mesh-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinMesh.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run mesh:test 的构建步骤`);
}

const {
  rebuildMesh,
  isRebuilt,
  stripLegacyPadding,
  prepareMeshFile,
  elfHashLower,
  isSkeleton,
  isMesh,
  MeshError,
  NULL_JOINT_HASH,
} = meshModule;

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

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

const checkGolden = (label, data) => {
  const [hash, size] = GOLDEN[label];
  assert.equal(data.length, size, `${label} 字节数`);
  assert.equal(sha256(data), hash, `${label} sha256`);
};

for (const [name, data] of Object.entries(CASES)) {
  step(`${name}: fixture 与 Rose 的 Python 版一致`, () => {
    checkGolden(`${name}.in`, data);
    return `${data.length} 字节`;
  });

  step(`${name}: 重建结果与 Rose 的 Python 版逐字节一致`, () => {
    const { data: rebuilt, added } = rebuildMesh(data);
    checkGolden(`${name}.rebuilt`, rebuilt);
    assert.equal(added, name.startsWith('skl') ? 'null joint' : 'null vertex');
    return `${added}，${data.length} -> ${rebuilt.length} 字节`;
  });

  step(`${name}: 重建前后 isRebuilt 状态`, () => {
    assert.equal(isRebuilt(data), false, '原文件不该算重建过');
    assert.equal(isRebuilt(rebuildMesh(data).data), true, '重建结果应该算重建过');
  });

  step(`${name}: 削掉老 Rose 的 16 字节填充`, () => {
    const padded = Buffer.concat([data, Buffer.alloc(16)]);
    assert.ok(stripLegacyPadding(padded).equals(data));
    assert.ok(stripLegacyPadding(data).equals(data), '没有填充时原样返回');
  });

  step(`${name}: prepareMeshFile 幂等`, () => {
    const padded = Buffer.concat([data, Buffer.alloc(16)]);
    const once = prepareMeshFile(padded);
    checkGolden(`${name}.rebuilt`, once.data);
    assert.equal(once.changed, true);
    const twice = prepareMeshFile(once.data);
    assert.ok(twice.data.equals(once.data), '已重建的不要再建一遍');
    assert.equal(twice.changed, false);
  });

  step(`${name}: 类型判断`, () => {
    assert.equal(isSkeleton(data), name.startsWith('skl'));
    assert.equal(isMesh(data), name.startsWith('skn'));
  });
}

step('ELF 哈希（关节查找表用）', () => {
  const expected = {
    null_bone: 52822405,
    root: 497252,
    spine: 8024133,
    Head: 453492,
    SPINE_01: 117749137,
    j00: 27952,
    'a.b.c': 6571331,
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(elfHashLower(name), value, name);
  }
  assert.equal(NULL_JOINT_HASH, 52822405);
  return `${Object.keys(expected).length} 个名字`;
});

step('不是网格/骨架就报错', () => {
  for (const bad of [Buffer.from('MESH'), Buffer.alloc(0), Buffer.from('RW\0\0')]) {
    assert.throws(() => rebuildMesh(bad), MeshError);
  }
  assert.equal(isRebuilt(Buffer.from('MESH')), false, '认不出来就是没重建过');
  assert.ok(stripLegacyPadding(Buffer.from('MESH')).equals(Buffer.from('MESH')));
  return 'MeshError';
});

step('截断的骨架/网格报错而不是崩', () => {
  const skl = CASES.skl_two.subarray(0, 120);
  assert.throws(() => rebuildMesh(skl), MeshError);
  const skn = CASES.skn_v4.subarray(0, 60);
  assert.throws(() => rebuildMesh(skn), MeshError);
  return 'MeshError';
});

step('已经有 null_bone 的骨架不再加一根', () => {
  const rebuilt = rebuildMesh(CASES.skl_two).data;
  assert.throws(() => rebuildMesh(rebuilt), /already has a joint hashed like null_bone/);
  return '拒绝重复添加';
});

console.log(failures === 0 ? '\nSKN/SKL 重建测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
