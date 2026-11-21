/**
 * SKN / SKL 重建（照抄 Rose 1.5.9 的 `injection/baseskin/mesh.py`，提交 2c64012d）。
 *
 * 背景：LTK Manager 的 patcher 认 base 皮肤的方式是「skin0 的骨架/网格不能是
 * 同英雄别的皮肤的网格」。老版本 Rose（1.5.6～1.5.8）和本项目的旧实现是往
 * SKN/SKL 末尾补 16 个 0 字节 —— 但 patcher 比较时**忽略追加的尾巴**，所以补
 * 0 没用，包还是被判成 skinhack。
 *
 * Rose 1.5.9 改成「重建」：加一个谁都不用的东西，让文件与游戏自带的不同，
 * 但模型/动画一模一样（对应的 RoseBin 实现在 tools/rosebin/src/mesh.rs）：
 *   - 骨架：多一根根部关节 null_bone（原点、单位绑定姿势、没有动画轨道、
 *     不影响任何顶点），插在关节表末尾并按名称哈希排进查找表；
 *   - 网格：多一个顶点，是最后一个顶点的拷贝，加在顶点缓冲和最后一个
 *     submesh 的 range 末尾；索引缓冲不动，所以没有三角形用它。
 *
 * 其余字节全部保留。Rose 在游戏所有英雄 WAD 上验证过（2026-11-18）：
 * 骨架都是 version 0，关节查找表按关节名（小写）的 ELF 哈希排序，末尾补 0
 * 到 4 的倍数；网格是 version 4.1 / 2.1 / 1.1 / 0.1，最后一个 submesh 的
 * range 都结束在最后一个顶点。
 *
 * 另外两个是 Rose 自己加的：`isRebuilt` 让已经重建过的文件不再重建（Rose
 * 会重复检查存量皮肤，RoseBin 只建一次），`stripLegacyPadding` 把老 Rose
 * 补上的那 16 个 0 字节削掉再重建。
 */

/** SKL 头部第 4 字节起的标记（RW 前 4 字节是版本/尺寸） */
export const SKL_FORMAT_TOKEN = 0x22fd4fc3;
/** SKN 文件头魔数 */
export const SKN_MAGIC = 0x00112233;

export const NULL_JOINT_NAME = 'null_bone';

// 骨架头部字段偏移
const SKL_HEADER_SIZE = 64;
const SKL_FILE_SIZE = 0;
const SKL_VERSION = 8;
const SKL_JOINT_COUNT = 14;
const SKL_INFLUENCE_COUNT = 16;
// 六个区段偏移：关节、关节查找表、影响、骨架名、资源名、关节名（<=0 表示没有）
const SKL_SECTION_OFFSETS = 20;
const SKL_JOINTS = 0;
const SKL_TABLE = 1;
const SKL_INFLUENCES = 2;
const SKL_NAME = 3;
const SKL_ASSET_NAME = 4;

const SKL_JOINT_SIZE = 100;
const JOINT_NAME_OFFSET = 96; // 关节名字段，值相对该字段自身
const SKL_TABLE_ENTRY_SIZE = 8; // 关节 id(i16)、填充(i16)、名称哈希(u32)
const JOINT_RADIUS = 2.1;

const SKN_RANGE_SIZE = 80;
const RANGE_VERTEX_START = 64; // 在 range 的 64 字节材质名之后
const RANGE_VERTEX_COUNT = 68;
const LEGACY_VERTEX_SIZE = 52; // 4 之前的版本不存顶点大小
const SKN_BOUNDS_SIZE = 40; // 4 版的包围盒（6 个 float）和包围球（4 个 float）

/** 老 Rose 往每个 SKN/SKL 后面补的东西 */
const LEGACY_PADDING = Buffer.alloc(16);

/** 不是能重建的骨架或网格 */
export class MeshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeshError';
  }
}

const u16 = (data: Buffer, at: number): number | null =>
  at >= 0 && at + 2 <= data.length ? data.readUInt16LE(at) : null;
const u32 = (data: Buffer, at: number): number | null =>
  at >= 0 && at + 4 <= data.length ? data.readUInt32LE(at) : null;
const i32 = (data: Buffer, at: number): number | null =>
  at >= 0 && at + 4 <= data.length ? data.readInt32LE(at) : null;

/** 骨架里关节名用的 ELF 哈希（名称先转小写） */
export const elfHashLower = (name: string): number => {
  let value = 0;
  for (const original of Buffer.from(name, 'utf8')) {
    let byte = original;
    if (byte >= 65 && byte <= 90) {
      byte += 32;
    }
    value = ((value << 4) + byte) >>> 0;
    const high = value & 0xf0000000;
    if (high !== 0) {
      value = (value ^ (high >>> 24)) >>> 0;
      value = (value & (~high >>> 0)) >>> 0;
    }
  }
  return value;
};

export const NULL_JOINT_HASH = elfHashLower(NULL_JOINT_NAME);

interface Section {
  start: number;
  end: number;
}

const section = (data: Buffer, offset: number, length: number): Section | null => {
  if (offset <= 0) {
    return null;
  }
  const end = offset + length;
  return end <= data.length ? { start: offset, end } : null;
};

/** offset 处的 NUL 结尾字符串（含结尾的 NUL） */
const stringAt = (data: Buffer, offset: number): Section | null => {
  if (offset < 0 || offset >= data.length) {
    return null;
  }
  const end = data.indexOf(0, offset);
  return end >= 0 ? { start: offset, end: end + 1 } : null;
};

export const isSkeleton = (data: Buffer): boolean => u32(data, 4) === SKL_FORMAT_TOKEN;

export const isMesh = (data: Buffer): boolean => u32(data, 0) === SKN_MAGIC;

/**
 * 骨架里的关节名（按关节顺序，原样大小写）。
 *
 * 用来判断技能特效的挂点骨头在不在：bin 里的 `boneName`（`Idle_taze_01` 的 `Spike` 这类）
 * 找不到对应关节时，游戏会把特效塌到模型原点 —— 看着就是「脚下一团东西」。
 * 读不懂的骨架返回空数组，调用方据此跳过（不要拿空集合去删特效）。
 */
export const readSkeletonJointNames = (data: Buffer): string[] => {
  try {
    const layout = readSkeleton(data);
    return layout.strings.slice(0, layout.count).map((item) =>
      data.toString('latin1', item.start, Math.max(item.start, item.end - 1))
    );
  } catch {
    return [];
  }
};

interface SkeletonLayout {
  count: number;
  offsets: number[];
  joints: Section;
  table: Section;
  strings: Section[];
  sections: Section[];
  contentEnd: number;
}

/** 读出重建需要的骨架区段；读不懂就抛 MeshError */
const readSkeleton = (data: Buffer): SkeletonLayout => {
  if (data.length < SKL_HEADER_SIZE) {
    throw new MeshError('skeleton header truncated');
  }
  const version = u32(data, SKL_VERSION) ?? 0;
  if (version !== 0) {
    throw new MeshError(`skeleton version ${version} not supported`);
  }
  const count = u16(data, SKL_JOINT_COUNT) ?? 0;
  if (count === 0 || count >= 0x7fff) {
    throw new MeshError(`skeleton has ${count} joints`);
  }
  const offsets = [0, 1, 2, 3, 4, 5].map((i) => i32(data, SKL_SECTION_OFFSETS + 4 * i) ?? 0);
  const joints = section(data, offsets[SKL_JOINTS], count * SKL_JOINT_SIZE);
  if (!joints) {
    throw new MeshError('skeleton joints out of bounds');
  }
  const table = section(data, offsets[SKL_TABLE], count * SKL_TABLE_ENTRY_SIZE);
  if (!table) {
    throw new MeshError('skeleton joint table out of bounds');
  }
  if (joints.start < table.end && table.start < joints.end) {
    throw new MeshError('skeleton joints and joint table overlap');
  }

  // 所有字符串：先是关节名（按关节顺序），再是骨架名/资源名
  const strings: Section[] = [];
  for (let i = 0; i < count; i++) {
    const field = joints.start + i * SKL_JOINT_SIZE + JOINT_NAME_OFFSET;
    const found = stringAt(data, field + (i32(data, field) ?? 0));
    if (!found) {
      throw new MeshError(`skeleton joint ${i} name out of bounds`);
    }
    strings.push(found);
  }
  for (const field of [SKL_NAME, SKL_ASSET_NAME]) {
    if (offsets[field] > 0) {
      const found = stringAt(data, offsets[field]);
      if (!found) {
        throw new MeshError('skeleton name out of bounds');
      }
      strings.push(found);
    }
  }
  let influences: Section | null = null;
  if (offsets[SKL_INFLUENCES] > 0) {
    const influenceCount = u32(data, SKL_INFLUENCE_COUNT) ?? 0;
    influences = section(data, offsets[SKL_INFLUENCES], influenceCount * 2);
    if (!influences) {
      throw new MeshError('skeleton influences out of bounds');
    }
  }

  const sections = [joints, table, ...(influences ? [influences] : []), ...strings];
  return {
    count,
    offsets,
    joints,
    table,
    strings,
    sections,
    contentEnd: sections.reduce((max, item) => Math.max(max, item.end), 0),
  };
};

/** 关节查找表里的名称哈希 */
const skeletonHashes = (data: Buffer, layout: SkeletonLayout): number[] => {
  const hashes: number[] = [];
  for (let at = layout.table.start; at < layout.table.end; at += SKL_TABLE_ENTRY_SIZE) {
    hashes.push(u32(data, at + 4) ?? 0);
  }
  return hashes;
};

const float32 = (value: number): number => Math.fround(value);

/** 原点上的根部关节：单位局部变换 + 单位绑定姿势 */
const nullJoint = (jointId: number, nameHash: number, nameOffset: number): Buffer => {
  const identity = [0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0];
  const out = Buffer.alloc(SKL_JOINT_SIZE);
  out.writeUInt16LE(0, 0);
  out.writeInt16LE(jointId, 2);
  out.writeInt16LE(-1, 4);
  out.writeInt16LE(0, 6);
  out.writeUInt32LE(nameHash, 8);
  out.writeFloatLE(float32(JOINT_RADIUS), 12);
  for (let copy = 0; copy < 2; copy++) {
    identity.forEach((value, index) => out.writeFloatLE(float32(value), 16 + copy * 40 + index * 4));
  }
  out.writeInt32LE(nameOffset, 96);
  return out;
};

/** 在最后一根关节后面加 null_bone，其余关节的下标和动画轨道都不变 */
const addNullJoint = (data: Buffer): Buffer => {
  const layout = readSkeleton(data);
  const { count, joints, table } = layout;

  // 新关节插在关节区末尾，查找表项插在表末尾（再排进去），两者都不能落在别的区段里
  const jointInsert = joints.end;
  const tableInsert = table.end;
  for (const item of layout.sections) {
    for (const at of [jointInsert, tableInsert]) {
      if (item.start < at && at < item.end) {
        throw new MeshError('skeleton sections overlap');
      }
    }
  }

  const entries: Buffer[] = [];
  for (let at = table.start; at < table.end; at += SKL_TABLE_ENTRY_SIZE) {
    entries.push(data.subarray(at, at + SKL_TABLE_ENTRY_SIZE));
  }
  if (entries.some((entry) => u32(entry, 4) === NULL_JOINT_HASH)) {
    throw new MeshError(`skeleton already has a joint hashed like ${NULL_JOINT_NAME}`);
  }

  // 最后一个区段后面的 0 填充，在新名字之后重做
  const tail = data.subarray(layout.contentEnd);
  const bodyEnd = tail.length < 4 && tail.every((byte) => byte === 0) ? layout.contentEnd : data.length;

  const moved = (at: number): number =>
    at + (at >= jointInsert ? SKL_JOINT_SIZE : 0) + (at >= tableInsert ? SKL_TABLE_ENTRY_SIZE : 0);

  const pieces: Buffer[] = [];
  let copied = 0;
  const inserts = (
    [
      [jointInsert, SKL_JOINT_SIZE],
      [tableInsert, SKL_TABLE_ENTRY_SIZE],
    ] as Array<[number, number]>
  ).sort((left, right) => left[0] - right[0]);
  for (const [at, length] of inserts) {
    pieces.push(data.subarray(copied, at), Buffer.alloc(length));
    copied = at;
  }
  pieces.push(data.subarray(copied, bodyEnd));
  const out = Buffer.concat(pieces);
  const nameAt = out.length;
  const named = Buffer.concat([out, Buffer.from(`${NULL_JOINT_NAME}\0`, 'ascii')]);
  const padded = Buffer.concat([named, Buffer.alloc((4 - (named.length % 4)) % 4)]);

  padded.writeUInt32LE(padded.length, SKL_FILE_SIZE);
  padded.writeUInt16LE(count + 1, SKL_JOINT_COUNT);
  layout.offsets.forEach((offset, index) => {
    if (offset > 0) {
      padded.writeInt32LE(moved(offset), SKL_SECTION_OFFSETS + 4 * index);
    }
  });
  layout.strings.slice(0, count).forEach((item, i) => {
    const field = moved(joints.start + i * SKL_JOINT_SIZE + JOINT_NAME_OFFSET);
    padded.writeInt32LE(moved(item.start) - field, field);
  });
  const jointAt = moved(jointInsert) - SKL_JOINT_SIZE;
  nullJoint(count, NULL_JOINT_HASH, nameAt - (jointAt + JOINT_NAME_OFFSET)).copy(padded, jointAt);

  const entry = Buffer.alloc(SKL_TABLE_ENTRY_SIZE);
  entry.writeInt16LE(count, 0);
  entry.writeInt16LE(0, 2);
  entry.writeUInt32LE(NULL_JOINT_HASH, 4);
  const position = entries.findIndex((other) => (u32(other, 4) ?? 0) > NULL_JOINT_HASH);
  entries.splice(position < 0 ? entries.length : position, 0, entry);
  const start = moved(table.start);
  Buffer.concat(entries).copy(padded, start);

  return padded;
};

interface MeshLayout {
  lastRange: number | null;
  vertexCountAt: number;
  indicesAt: number;
  indexCount: number;
  vertexCount: number;
  vertexSize: number;
  verticesEnd: number;
}

/** 读出重建需要的网格布局；读不懂就抛 MeshError */
const readMesh = (data: Buffer): MeshLayout => {
  const truncated = (): MeshError => new MeshError('mesh truncated');

  const major = u16(data, 4);
  if (major === null) {
    throw truncated();
  }
  let at = 8;
  let lastRange: number | null = null;
  if (major === 1 || major === 2 || major === 4) {
    const rangeCount = u32(data, at);
    if (rangeCount === null) {
      throw truncated();
    }
    at += 4;
    if (rangeCount > 0) {
      lastRange = at + (rangeCount - 1) * SKN_RANGE_SIZE;
    }
    at += rangeCount * SKN_RANGE_SIZE;
    if (major === 4) {
      at += 4; // flags
    }
  } else if (major !== 0) {
    throw new MeshError(`mesh version ${major} not supported`);
  }
  const indexCount = u32(data, at);
  const vertexCount = u32(data, at + 4);
  if (indexCount === null || vertexCount === null) {
    throw truncated();
  }
  const vertexCountAt = at + 4;
  at += 8;
  let vertexSize = LEGACY_VERTEX_SIZE;
  if (major === 4) {
    const size = u32(data, at);
    if (size === null) {
      throw truncated();
    }
    vertexSize = size;
    at += 8 + SKN_BOUNDS_SIZE; // 顶点大小、顶点类型、包围盒
  }
  if (vertexCount === 0 || vertexSize === 0) {
    throw new MeshError('mesh has no vertices');
  }
  const indicesAt = at;
  const verticesEnd = at + indexCount * 2 + vertexCount * vertexSize;
  if (verticesEnd > data.length) {
    throw truncated();
  }
  return { lastRange, vertexCountAt, indicesAt, indexCount, vertexCount, vertexSize, verticesEnd };
};

/** 顶点缓冲和最后一个 submesh 的 range 末尾各加一个末顶点的拷贝（索引不变） */
const addNullVertex = (data: Buffer): Buffer => {
  const layout = readMesh(data);
  const end = layout.verticesEnd;
  const size = layout.vertexSize;
  const out = Buffer.concat([
    data.subarray(0, end),
    data.subarray(end - size, end),
    data.subarray(end),
  ]);
  out.writeUInt32LE(layout.vertexCount + 1, layout.vertexCountAt);
  if (layout.lastRange !== null) {
    const start = u32(data, layout.lastRange + RANGE_VERTEX_START);
    const count = u32(data, layout.lastRange + RANGE_VERTEX_COUNT);
    if (start === null || count === null) {
      throw new MeshError('mesh truncated');
    }
    if (start + count === layout.vertexCount) {
      out.writeUInt32LE(count + 1, layout.lastRange + RANGE_VERTEX_COUNT);
    }
  }
  return out;
};

export type MeshRebuildKind = 'null joint' | 'null vertex';

export interface MeshRebuild {
  data: Buffer;
  added: MeshRebuildKind;
}

/** 重建一个骨架或网格（按文件头区分）；不是这两种就抛 MeshError */
export const rebuildMesh = (data: Buffer): MeshRebuild => {
  if (isSkeleton(data)) {
    return { data: addNullJoint(data), added: 'null joint' };
  }
  if (isMesh(data)) {
    return { data: addNullVertex(data), added: 'null vertex' };
  }
  throw new MeshError('neither a skeleton (SKL) nor a mesh (SKN)');
};

/** 这个文件是不是已经重建过的：骨架带 null_bone，或网格末顶点是前一个的拷贝且没三角形用它 */
export const isRebuilt = (data: Buffer): boolean => {
  try {
    if (isSkeleton(data)) {
      return skeletonHashes(data, readSkeleton(data)).includes(NULL_JOINT_HASH);
    }
    if (isMesh(data)) {
      const layout = readMesh(data);
      if (layout.vertexCount < 2) {
        return false;
      }
      const end = layout.verticesEnd;
      const size = layout.vertexSize;
      if (!data.subarray(end - size, end).equals(data.subarray(end - 2 * size, end - size))) {
        return false;
      }
      const last = layout.vertexCount - 1;
      for (let i = 0; i < layout.indexCount; i++) {
        if (data.readUInt16LE(layout.indicesAt + i * 2) === last) {
          return false;
        }
      }
      return true;
    }
  } catch {
    return false;
  }
  return false;
};

/** 去掉老 Rose 补的 16 个 0 字节（在文件自身内容之后时）；否则原样返回 */
export const stripLegacyPadding = (data: Buffer): Buffer => {
  if (!data.subarray(data.length - LEGACY_PADDING.length).equals(LEGACY_PADDING)) {
    return data;
  }
  const stripped = data.subarray(0, data.length - LEGACY_PADDING.length);
  try {
    if (isSkeleton(data)) {
      return readSkeleton(stripped).contentEnd <= stripped.length ? stripped : data;
    }
    if (isMesh(data)) {
      return readMesh(stripped).verticesEnd <= stripped.length ? stripped : data;
    }
  } catch {
    return data;
  }
  return data;
};

/** 重建一个从游戏里取出来的网格文件：削掉老填充、已经重建过就不动 */
export const prepareMeshFile = (data: Buffer): MeshRebuild & { changed: boolean } => {
  const clean = stripLegacyPadding(data);
  if (isRebuilt(clean)) {
    return { data: clean, added: isSkeleton(clean) ? 'null joint' : 'null vertex', changed: clean !== data };
  }
  return { ...rebuildMesh(clean), changed: true };
};
