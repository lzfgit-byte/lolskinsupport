/**
 * Wwise 声音 bank（.bnk）的读写（照抄 Rose 1.5.9 的 `injection/baseskin/bnk.py`）。
 *
 * 只解析 HIRC 里的 Event（type 4）和 Action（type 3）：Event 的 body 就是它指向的
 * Action id 列表。别的 chunk 和别的对象一个字节都不动，所以没改过的 bank 写回去
 * 与原来完全相同 —— 这一点很重要，我们要把游戏自带的 bank 原样搬到新路径上去。
 *
 * 为什么需要：皮肤的专属音效挂在 `<英雄>_Skin<n>_SFX_events.bnk` 里，事件名是
 * `Play_sfx_<英雄>Skin<n>_...`。base 皮肤只认 `Play_sfx_<英雄>_...`，所以得在
 * bank 里补一批「base 名字 → 同一批 Action」的别名 Event（见 skin-banks.ts）。
 */

export const HIRC_ACTION = 3;
export const HIRC_EVENT = 4;
/** 这个版本及以前的 bank 用 u32 存 Event 的 action 数量，更新的用 Wwise 变长整数 */
const LAST_U32_ACTION_COUNT_VERSION = 122;

export class BankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankError';
  }
}

const hashCache = new Map<string, number>();

/** Wwise 的 32 位 FNV-1 哈希（名称先转小写）：Event 的 id */
export const wwiseHash = (name: string): number => {
  const key = name.toLowerCase();
  const cached = hashCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let value = 0x811c9dc5;
  for (const byte of Buffer.from(key, 'utf8')) {
    value = (Math.imul(value, 0x01000193) ^ byte) >>> 0;
  }
  hashCache.set(key, value);
  return value;
};

interface HircObject {
  kind: number;
  id: number;
  body: Buffer;
}

type Chunk = { kind: 'raw'; tag: string; body: Buffer } | { kind: 'hirc'; objects: HircObject[] };

const readVarUint = (data: Buffer): { value: number; used: number } | null => {
  let value = 0;
  for (let index = 0; index < Math.min(5, data.length); index++) {
    const byte = data[index];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, used: index + 1 };
    }
  }
  return null;
};

const writeVarUint = (input: number): Buffer => {
  const groups = [input & 0x7f];
  let value = Math.floor(input / 128);
  while (value > 0) {
    groups.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  return Buffer.from(groups.reverse());
};

const decodeActions = (body: Buffer, version: number): number[] | null => {
  let count: number;
  let pos: number;
  if (version <= LAST_U32_ACTION_COUNT_VERSION) {
    if (body.length < 4) {
      return null;
    }
    count = body.readUInt32LE(0);
    pos = 4;
  } else {
    const counted = readVarUint(body);
    if (!counted) {
      return null;
    }
    count = counted.value;
    pos = counted.used;
  }
  if (body.length !== pos + count * 4) {
    return null;
  }
  const actions: number[] = [];
  for (let index = 0; index < count; index++) {
    actions.push(body.readUInt32LE(pos + index * 4));
  }
  return actions;
};

const encodeActions = (actions: number[], version: number): Buffer => {
  const head =
    version <= LAST_U32_ACTION_COUNT_VERSION
      ? Buffer.alloc(4)
      : writeVarUint(actions.length);
  if (version <= LAST_U32_ACTION_COUNT_VERSION) {
    head.writeUInt32LE(actions.length, 0);
  }
  const body = Buffer.alloc(actions.length * 4);
  actions.forEach((action, index) => body.writeUInt32LE(action, index * 4));
  return Buffer.concat([head, body]);
};

const parseHirc = (data: Buffer): HircObject[] => {
  if (data.length < 4) {
    throw new BankError('HIRC chunk is too short');
  }
  const count = data.readUInt32LE(0);
  const objects: HircObject[] = [];
  let pos = 4;
  for (let index = 0; index < count; index++) {
    if (pos + 5 > data.length) {
      throw new BankError(`truncated HIRC object ${index}`);
    }
    const kind = data[pos];
    const size = data.readUInt32LE(pos + 1);
    if (size < 4) {
      throw new BankError(`HIRC object ${index} is smaller than its ID`);
    }
    if (pos + 5 + size > data.length) {
      throw new BankError(`HIRC object ${index} overruns the chunk`);
    }
    const payload = data.subarray(pos + 5, pos + 5 + size);
    objects.push({ kind, id: payload.readUInt32LE(0), body: Buffer.from(payload.subarray(4)) });
    pos += 5 + size;
  }
  if (pos !== data.length) {
    throw new BankError(`HIRC chunk has ${data.length - pos} trailing bytes`);
  }
  return objects;
};

/** 一个解析过的 bank。没改过的对象保持原字节，写回去与原文件一致。 */
export class Bank {
  version: number;
  private chunks: Chunk[];
  private index: Map<number, HircObject[]> | null = null;

  constructor(version: number, chunks: Chunk[]) {
    this.version = version;
    this.chunks = chunks;
  }

  static parse(data: Buffer): Bank {
    const chunks: Chunk[] = [];
    let version: number | null = null;
    let pos = 0;
    while (pos < data.length) {
      if (pos + 8 > data.length) {
        throw new BankError(`truncated bank chunk header at ${pos}`);
      }
      const tag = data.toString('latin1', pos, pos + 4);
      const length = data.readUInt32LE(pos + 4);
      if (pos + 8 + length > data.length) {
        throw new BankError(`bank chunk ${tag} overruns the file`);
      }
      const body = data.subarray(pos + 8, pos + 8 + length);
      if (tag === 'BKHD') {
        if (length < 4) {
          throw new BankError('BKHD chunk is too short');
        }
        version = body.readUInt32LE(0);
      }
      if (tag === 'HIRC') {
        chunks.push({ kind: 'hirc', objects: parseHirc(body) });
      } else {
        chunks.push({ kind: 'raw', tag, body: Buffer.from(body) });
      }
      pos += 8 + length;
    }
    if (version === null) {
      throw new BankError('bank has no BKHD chunk');
    }
    return new Bank(version, chunks);
  }

  write(): Buffer {
    const parts: Buffer[] = [];
    for (const chunk of this.chunks) {
      if (chunk.kind === 'raw') {
        const head = Buffer.alloc(8);
        head.write(chunk.tag, 0, 'latin1');
        head.writeUInt32LE(chunk.body.length, 4);
        parts.push(head, chunk.body);
        continue;
      }
      const bodyParts: Buffer[] = [];
      for (const object of chunk.objects) {
        const head = Buffer.alloc(5);
        head.writeUInt8(object.kind, 0);
        head.writeUInt32LE(4 + object.body.length, 1);
        bodyParts.push(head);
        const id = Buffer.alloc(4);
        id.writeUInt32LE(object.id, 0);
        bodyParts.push(id, object.body);
      }
      const body = Buffer.concat(bodyParts);
      const head = Buffer.alloc(8);
      head.write('HIRC', 0, 'latin1');
      head.writeUInt32LE(body.length + 4, 4);
      const count = Buffer.alloc(4);
      count.writeUInt32LE(chunk.objects.length, 0);
      parts.push(head, count, body);
    }
    return Buffer.concat(parts);
  }

  private objects(): HircObject[] {
    const out: HircObject[] = [];
    for (const chunk of this.chunks) {
      if (chunk.kind === 'hirc') {
        out.push(...chunk.objects);
      }
    }
    return out;
  }

  private eventIndex(): Map<number, HircObject[]> {
    if (this.index === null) {
      const index = new Map<number, HircObject[]>();
      for (const object of this.objects()) {
        if (object.kind === HIRC_EVENT) {
          const found = index.get(object.id);
          if (found) {
            found.push(object);
          } else {
            index.set(object.id, [object]);
          }
        }
      }
      this.index = index;
    }
    return this.index;
  }

  hasEvent(eventId: number): boolean {
    return this.eventIndex().has(eventId);
  }

  eventIds(): number[] {
    return Array.from(this.eventIndex().keys());
  }

  /** 这个 id 的第一个 Event 指向的 action 列表（没有或不认识就 null） */
  eventActions(eventId: number): number[] | null {
    const found = this.eventIndex().get(eventId);
    return found && found.length > 0 ? decodeActions(found[0].body, this.version) : null;
  }

  /** 把这个 id 的每个 Event 都指向 *actions*；返回改了几个 */
  setEventActions(eventId: number, actions: number[]): number {
    const body = encodeActions(actions, this.version);
    let changed = 0;
    for (const object of this.eventIndex().get(eventId) ?? []) {
      if (!object.body.equals(body)) {
        object.body = body;
        changed++;
      }
    }
    return changed;
  }

  /** 追加一个 Event（调用方保证 id 没被占用） */
  addEvent(eventId: number, actions: number[]): void {
    for (const chunk of this.chunks) {
      if (chunk.kind === 'hirc') {
        const object: HircObject = {
          kind: HIRC_EVENT,
          id: eventId,
          body: encodeActions(actions, this.version),
        };
        chunk.objects.push(object);
        if (this.index !== null) {
          const found = this.index.get(eventId);
          if (found) {
            found.push(object);
          } else {
            this.index.set(eventId, [object]);
          }
        }
        return;
      }
    }
    throw new BankError('bank has no HIRC chunk');
  }

  /** 删掉这个 id 的所有 Event（它指向的 Action 留着，只是没人引用）；返回删了几个 */
  removeEvent(eventId: number): number {
    let removed = 0;
    for (const chunk of this.chunks) {
      if (chunk.kind === 'hirc') {
        const kept = chunk.objects.filter(
          (object) => !(object.kind === HIRC_EVENT && object.id === eventId)
        );
        removed += chunk.objects.length - kept.length;
        chunk.objects = kept;
      }
    }
    this.index = null;
    return removed;
  }
}
