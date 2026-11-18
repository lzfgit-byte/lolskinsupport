/**
 * League WAD 的路径哈希：xxHash64(小写路径, seed = 0)。
 *
 * 生成皮肤时要按路径从游戏 WAD 里取出 SKN/SKL，而 WAD 的目录只存哈希，
 * 所以得自己算 —— 不能读 hashes.game.txt（229 MB，每次生成都解析太重）。
 * 结果和 hashes.game.txt 里的值一致（已用里面的条目验证）。
 */

const MASK = (1n << 64n) - 1n;
const PRIME1 = 0x9e3779b185ebca87n;
const PRIME2 = 0xc2b2ae3d27d4eb4fn;
const PRIME3 = 0x165667b19e3779f9n;
const PRIME4 = 0x85ebca77c2b2ae63n;
const PRIME5 = 0x27d4eb2f165667c5n;

const rotl = (value: bigint, bits: bigint): bigint =>
  ((value << bits) | (value >> (64n - bits))) & MASK;

const mul = (a: bigint, b: bigint): bigint => (a * b) & MASK;

const round = (acc: bigint, input: bigint): bigint => {
  let value = (acc + mul(input, PRIME2)) & MASK;
  value = rotl(value, 31n);
  return mul(value, PRIME1);
};

const mergeRound = (acc: bigint, value: bigint): bigint => {
  const mixed = round(0n, value);
  return (mul(acc ^ mixed, PRIME1) + PRIME4) & MASK;
};

/** 计算路径哈希，返回 16 位小写十六进制（与 WAD 目录里的 hash 一致） */
export const wadPathHash = (filePath: string): string => {
  const buffer = Buffer.from(filePath.replace(/\\/g, '/').toLowerCase(), 'utf8');
  const length = buffer.length;
  let offset = 0;
  let hash: bigint;

  if (length >= 32) {
    let v1 = (PRIME1 + PRIME2) & MASK;
    let v2 = PRIME2;
    let v3 = 0n;
    let v4 = (0n - PRIME1) & MASK;
    const limit = length - 32;
    while (offset <= limit) {
      v1 = round(v1, buffer.readBigUInt64LE(offset));
      offset += 8;
      v2 = round(v2, buffer.readBigUInt64LE(offset));
      offset += 8;
      v3 = round(v3, buffer.readBigUInt64LE(offset));
      offset += 8;
      v4 = round(v4, buffer.readBigUInt64LE(offset));
      offset += 8;
    }
    hash = (rotl(v1, 1n) + rotl(v2, 7n) + rotl(v3, 12n) + rotl(v4, 18n)) & MASK;
    hash = mergeRound(hash, v1);
    hash = mergeRound(hash, v2);
    hash = mergeRound(hash, v3);
    hash = mergeRound(hash, v4);
  } else {
    hash = PRIME5;
  }

  hash = (hash + BigInt(length)) & MASK;

  while (offset + 8 <= length) {
    hash ^= round(0n, buffer.readBigUInt64LE(offset));
    hash = (rotl(hash, 27n) * PRIME1 + PRIME4) & MASK;
    offset += 8;
  }
  if (offset + 4 <= length) {
    hash ^= (BigInt(buffer.readUInt32LE(offset)) * PRIME1) & MASK;
    hash = (rotl(hash, 23n) * PRIME2 + PRIME3) & MASK;
    offset += 4;
  }
  while (offset < length) {
    hash ^= (BigInt(buffer[offset]) * PRIME5) & MASK;
    hash = (rotl(hash, 11n) * PRIME1) & MASK;
    offset += 1;
  }

  hash ^= hash >> 33n;
  hash = mul(hash, PRIME2);
  hash ^= hash >> 29n;
  hash = mul(hash, PRIME3);
  hash ^= hash >> 32n;
  return hash.toString(16).padStart(16, '0');
};
