/**
 * SKN/SKL 测试用的小文件（照 Rose 的 `injection/tests/mesh_fixtures.py` 逐字节移植）。
 *
 * 期望的 sha256 来自 Rose 1.5.9 的 `injection/baseskin/mesh.py` 对同一批 fixture
 * 的输出：两边字节一致，才说明我们的重建没走样。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinMesh.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run mesh:test 的构建步骤`);
}

export const meshModule = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);
export const { elfHashLower } = meshModule;

export const SKL_FORMAT_TOKEN = 0x22fd4fc3;
export const SKN_MAGIC = 0x00112233;
const SKL_HEADER_SIZE = 64;
const SKL_JOINT_SIZE = 100;
const JOINT_NAME_OFFSET = 96;
const JOINT_RADIUS = 2.1;
const LEGACY_VERTEX_SIZE = 52;

/** Rose 的 mesh_fixtures.skl：头部、关节、查找表、影响、骨架名、资源名、关节名、0 填充 */
export const makeSkl = (joints, namesFirst = false) => {
  const count = joints.length;
  const jointsAt = SKL_HEADER_SIZE;
  const tableAt = jointsAt + count * SKL_JOINT_SIZE;
  const influencesAt = tableAt + count * 8;
  const stringsAt = influencesAt + count * 2;
  let strings = Buffer.alloc(0);
  const put = (text) => {
    const at = stringsAt + strings.length;
    strings = Buffer.concat([strings, Buffer.from(`${text}\0`, 'ascii')]);
    return at;
  };

  let jointNames;
  let nameAt;
  let assetAt;
  if (namesFirst) {
    jointNames = joints.map(([name]) => put(name));
    nameAt = put('skeleton');
    assetAt = put('asset');
  } else {
    nameAt = put('skeleton');
    assetAt = put('asset');
    jointNames = joints.map(([name]) => put(name));
  }

  const out = Buffer.alloc(SKL_HEADER_SIZE);
  out.writeUInt32LE(SKL_FORMAT_TOKEN, 4);
  out.writeUInt16LE(count, 14);
  out.writeUInt32LE(count, 16);
  [jointsAt, tableAt, influencesAt, nameAt, assetAt, jointNames[0]].forEach((offset, index) =>
    out.writeInt32LE(offset, 20 + 4 * index)
  );
  for (let i = 0; i < 5; i++) {
    out.writeInt32LE(-1, 44 + 4 * i);
  }

  const parts = [out];
  joints.forEach(([name, parent], index) => {
    const at = SKL_HEADER_SIZE + index * SKL_JOINT_SIZE;
    const joint = Buffer.alloc(SKL_JOINT_SIZE);
    joint.writeUInt16LE(0, 0);
    joint.writeInt16LE(index, 2);
    joint.writeInt16LE(parent, 4);
    joint.writeInt16LE(0, 6);
    joint.writeUInt32LE(elfHashLower(name), 8);
    joint.writeFloatLE(JOINT_RADIUS, 12);
    for (let value = 0; value < 20; value++) {
      joint.writeFloatLE(Math.fround(index + value / 8.0), 16 + value * 4);
    }
    joint.writeInt32LE(jointNames[index] - (at + JOINT_NAME_OFFSET), 96);
    parts.push(joint);
  });
  for (const [, index] of joints
    .map(([name], index) => [elfHashLower(name), index])
    .sort((left, right) => left[0] - right[0])) {
    const entry = Buffer.alloc(8);
    entry.writeInt16LE(index, 0);
    entry.writeInt16LE(0, 2);
    entry.writeUInt32LE(elfHashLower(joints[index][0]), 4);
    parts.push(entry);
  }
  for (let i = 0; i < count; i++) {
    const influence = Buffer.alloc(2);
    influence.writeInt16LE(i, 0);
    parts.push(influence);
  }
  parts.push(strings);
  const body = Buffer.concat(parts);
  const padded = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
  padded.writeUInt32LE(padded.length, 0);
  return padded;
};

/** Rose 的 mesh_fixtures.skn：每个 range 画一个三角形，顶点各不相同 */
export const makeSkn = (major, ranges, seed = 0) => {
  const vertexCount = ranges.length ? ranges[ranges.length - 1][0] + ranges[ranges.length - 1][1] : 0;
  const vertexSize = major === 4 ? 56 : LEGACY_VERTEX_SIZE;
  const indices = ranges.flatMap(([start]) => [start, start + 1, start + 2]);
  const parts = [];
  const head = Buffer.alloc(8);
  head.writeUInt32LE(SKN_MAGIC, 0);
  head.writeUInt16LE(major, 4);
  head.writeUInt16LE(1, 6);
  parts.push(head);
  if (major !== 0) {
    const rangesCount = Buffer.alloc(4);
    rangesCount.writeUInt32LE(ranges.length, 0);
    parts.push(rangesCount);
    ranges.forEach(([start, count], index) => {
      const range = Buffer.alloc(80);
      Buffer.from(`mat${String(index).padStart(2, '0')}`, 'ascii').copy(range, 0);
      range.writeUInt32LE(start, 64);
      range.writeUInt32LE(count, 68);
      range.writeUInt32LE(index * 3, 72);
      range.writeUInt32LE(3, 76);
      parts.push(range);
    });
  }
  if (major === 4) {
    parts.push(Buffer.alloc(4));
  }
  const counts = Buffer.alloc(8);
  counts.writeUInt32LE(indices.length, 0);
  counts.writeUInt32LE(vertexCount, 4);
  parts.push(counts);
  if (major === 4) {
    const layout = Buffer.alloc(8);
    layout.writeUInt32LE(vertexSize, 0);
    layout.writeUInt32LE(1, 4);
    parts.push(layout);
    const bounds = Buffer.alloc(40);
    for (let value = 0; value < 10; value++) {
      bounds.writeFloatLE(value - 3.0, value * 4);
    }
    parts.push(bounds);
  }
  const indexBuffer = Buffer.alloc(indices.length * 2);
  indices.forEach((value, index) => indexBuffer.writeUInt16LE(value, index * 2));
  parts.push(indexBuffer);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const buffer = Buffer.alloc(vertexSize);
    for (let byte = 0; byte < vertexSize; byte++) {
      buffer[byte] = (vertex * 7 + byte + seed) & 0xff;
    }
    parts.push(buffer);
  }
  if (major !== 0) {
    parts.push(Buffer.alloc(12));
  }
  return Buffer.concat(parts);
};

export const CASES = {
  skl_two: makeSkl([
    ['root', -1],
    ['spine', 0],
  ]),
  skl_names_first: makeSkl(
    [
      ['root', -1],
      ['spine', 0],
      ['head', 1],
    ],
    true
  ),
  skl_many: makeSkl(
    Array.from({ length: 40 }, (_unused, index) => [
      `j${String(index).padStart(2, '0')}`,
      index === 0 ? -1 : index - 1,
    ])
  ),
  skl_one: makeSkl([['root', -1]]),
  skn_v4: makeSkn(
    4,
    [
      [0, 3],
      [3, 4],
    ],
    3
  ),
  skn_v4_single: makeSkn(4, [[0, 5]], 9),
  skn_v2: makeSkn(
    2,
    [
      [0, 3],
      [3, 3],
    ],
    5
  ),
  skn_v1: makeSkn(1, [[0, 6]], 7),
  skn_v0: makeSkn(
    0,
    [
      [0, 3],
      [3, 3],
    ],
    11
  ),
};

/** Rose 1.5.9 的 mesh.py 对这同一批 fixture 的输出（sha256 + 字节数） */
export const GOLDEN = {
  'skl_two.in': ['402891c7d1edec12df49e86dd181b6640d7b7db8d0a48aa8e910f7c8199b241b', 312],
  'skl_two.rebuilt': ['3472aa095ea5a3cb7302b1f702997141a9265aed2eee2520da9ab8eab995dac8', 428],
  'skl_names_first.in': ['91dc2392bb39c77189650ebe65073191caff9fb0591a7f2d4cf48395cdb8a302', 428],
  'skl_names_first.rebuilt': ['054b9a87c1abfc21b36136d44cd914a22b503a40888c7408dc9fbec1e4bb1222', 544],
  'skl_many.in': ['d242b07d077c59e2b5289bcf972bb6ee29c63a9a62fa07a0c26c9ce997d32122', 4640],
  'skl_many.rebuilt': ['8c4e4c2cf5cf9ab83af207311ac7afcf3bb2b9e1ff676a47acf6d6b713684599', 4760],
  'skl_one.in': ['121f0c72c4e6f96ee0b5b51dd3f8981248390b87240c34d3cc817d3fa3d970b0', 196],
  'skl_one.rebuilt': ['727dccd3427f909fa5bd92502fed4da0d17e7cd4b0369421755f8a574e3cb523', 312],
  'skn_v4.in': ['cecbc89d20a603f9ceaf3fd8d195ae8fb61533f1c3882e7224c21ac60318cf56', 648],
  'skn_v4.rebuilt': ['7faa09312101566c0e8b84dfcfa2a5b2e92eb5c655c50ec4260d03c99105f942', 704],
  'skn_v4_single.in': ['4dacf1107ab5461235c9d2a5a751f7dc7562135640a566726f89ad408eabbb04', 450],
  'skn_v4_single.rebuilt': ['6d872f6cdc27c68447665c4830af618fe33e3767fe4a73b44634474ee454dc61', 506],
  'skn_v2.in': ['33dd0defae2b696b595bfa28c65414128e42959fdadf4248e204412167f45091', 516],
  'skn_v2.rebuilt': ['0140dce18cc174b1909a91a4d49562a802f5d32c38cc4a83e17d35c436810300', 568],
  'skn_v1.in': ['99947fbed9acbc6295e872f13036b12d5be47766af7cbbb8ea7c16835224ff16', 430],
  'skn_v1.rebuilt': ['01930108f2dcce04ac4749a62cdff9ebf232e7ffe6f45af869f61935594ff649', 482],
  'skn_v0.in': ['1ea2410ae6e0194f1d3ac652aeb6e33271a7be9f4b3a602fa48e4db9d97a61e2', 340],
  'skn_v0.rebuilt': ['ff849e653acc11c36688570d0f4e2046d49cb8c437b3750a09f08c55f03e41a2', 392],
};
