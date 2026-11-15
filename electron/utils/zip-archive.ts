/**
 * 流式 ZIP 读取器 —— 只把中央目录读进内存，条目内容按需流式解压。
 *
 * 为什么不用 adm-zip：它在构造时 `readFileSync` 整个压缩包，Node 的 Buffer 上限
 * 是 2 GiB，LeagueSkins 那种 4.5 GB 的整包导入必然报
 * ERR_FS_FILE_TOO_LARGE。这里改成：
 *   - 从文件尾部找 EOCD（支持 ZIP64），读中央目录；
 *   - 需要哪个条目，就 seek 到它的本地头，读出压缩数据再流式 inflate。
 * 因此可以处理任意大小的压缩包，内存占用只跟条目数和单个条目的缓冲区有关。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;

/** 中央目录最多读这么多，防止异常文件把内存吃光 */
const MAX_CENTRAL_DIRECTORY_BYTES = 256 * 1024 * 1024;

export class ZipFormatError extends Error {}

export interface ZipEntry {
  /** 条目名（压缩包里用 / 分隔） */
  name: string;
  /** 0 = 存储，8 = deflate */
  method: number;
  flags: number;
  crc32: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
  isDirectory: boolean;
  encrypted: boolean;
}

const readAt = (fd: number, offset: number, length: number): Buffer => {
  const buffer = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    const got = fs.readSync(fd, buffer, read, length - read, offset + read);
    if (got <= 0) {
      throw new ZipFormatError(`压缩包在偏移 ${offset + read} 处意外结束`);
    }
    read += got;
  }
  return buffer;
};

const findEndOfCentralDirectory = (tail: Buffer, tailStart: number): number => {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) !== EOCD_SIG) {
      continue;
    }
    // 注释长度必须刚好到文件末尾，才算是真的 EOCD
    const commentLength = tail.readUInt16LE(i + 20);
    if (i + 22 + commentLength === tail.length) {
      return tailStart + i;
    }
  }
  throw new ZipFormatError('不是有效的 ZIP 文件（找不到中央目录结尾）');
};

const decodeName = (raw: Buffer, flags: number): string => {
  if (flags & 0x800) {
    return raw.toString('utf-8');
  }
  // 没有 UTF-8 标记的历史包，条目名基本都是 ASCII
  return raw.toString('latin1');
};

export class ZipArchive {
  private constructor(
    private readonly filePath: string,
    public readonly entries: ZipEntry[],
    private readonly fileSize: number
  ) {}

  /** 打开压缩包：只读文件尾的 EOCD、ZIP64 记录和中央目录 */
  static async open(filePath: string): Promise<ZipArchive> {
    const stat = await fsp.stat(filePath);
    if (!stat.size) {
      throw new ZipFormatError('压缩包是空的');
    }
    const fd = fs.openSync(filePath, 'r');
    try {
      const tailLength = Math.min(stat.size, 66 * 1024);
      const tailStart = stat.size - tailLength;
      const tail = readAt(fd, tailStart, tailLength);
      const eocdOffset = findEndOfCentralDirectory(tail, tailStart);

      const eocd = readAt(fd, eocdOffset, 22);
      let totalEntries = eocd.readUInt16LE(10);
      let directorySize = eocd.readUInt32LE(12);
      let directoryOffset = eocd.readUInt32LE(16);

      // ZIP64：四个字段任意一个是 0xFFFF/0xFFFFFFFF，就去看 ZIP64 记录
      if (
        totalEntries === 0xffff ||
        directorySize === 0xffffffff ||
        directoryOffset === 0xffffffff
      ) {
        const locator = readAt(fd, eocdOffset - 20, 20);
        if (locator.readUInt32LE(0) !== ZIP64_LOCATOR_SIG) {
          throw new ZipFormatError('压缩包需要 ZIP64，但找不到 ZIP64 定位记录');
        }
        const zip64Offset = Number(locator.readBigUInt64LE(8));
        const zip64 = readAt(fd, zip64Offset, 56);
        if (zip64.readUInt32LE(0) !== ZIP64_EOCD_SIG) {
          throw new ZipFormatError('ZIP64 中央目录结尾记录损坏');
        }
        totalEntries = Number(zip64.readBigUInt64LE(32));
        directorySize = Number(zip64.readBigUInt64LE(40));
        directoryOffset = Number(zip64.readBigUInt64LE(48));
      }

      if (
        directoryOffset < 0 ||
        directorySize <= 0 ||
        directoryOffset + directorySize > stat.size
      ) {
        throw new ZipFormatError('中央目录的位置超出文件范围');
      }
      if (directorySize > MAX_CENTRAL_DIRECTORY_BYTES) {
        throw new ZipFormatError(`中央目录过大（${Math.round(directorySize / 1024 / 1024)} MB）`);
      }

      const directory = readAt(fd, directoryOffset, directorySize);
      const entries = ZipArchive.parseCentralDirectory(directory, totalEntries);
      return new ZipArchive(filePath, entries, stat.size);
    } finally {
      fs.closeSync(fd);
    }
  }

  private static parseCentralDirectory(directory: Buffer, totalEntries: number): ZipEntry[] {
    const entries: ZipEntry[] = [];
    let offset = 0;
    while (
      offset + 46 <= directory.length &&
      directory.readUInt32LE(offset) === CENTRAL_HEADER_SIG
    ) {
      const flags = directory.readUInt16LE(offset + 8);
      const method = directory.readUInt16LE(offset + 10);
      const crc32 = directory.readUInt32LE(offset + 16);
      let compressedSize = directory.readUInt32LE(offset + 20);
      let size = directory.readUInt32LE(offset + 24);
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const commentLength = directory.readUInt16LE(offset + 32);
      let localHeaderOffset = directory.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const name = decodeName(directory.subarray(nameStart, nameStart + nameLength), flags);

      // ZIP64 扩展字段：只补 0xFFFFFFFF 的那几个，顺序固定
      if (
        size === 0xffffffff ||
        compressedSize === 0xffffffff ||
        localHeaderOffset === 0xffffffff
      ) {
        const extraStart = nameStart + nameLength;
        let extra = extraStart;
        const extraEnd = extraStart + extraLength;
        while (extra + 4 <= extraEnd) {
          const id = directory.readUInt16LE(extra);
          const length = directory.readUInt16LE(extra + 2);
          if (id === 0x0001) {
            let cursor = extra + 4;
            if (size === 0xffffffff) {
              size = Number(directory.readBigUInt64LE(cursor));
              cursor += 8;
            }
            if (compressedSize === 0xffffffff) {
              compressedSize = Number(directory.readBigUInt64LE(cursor));
              cursor += 8;
            }
            if (localHeaderOffset === 0xffffffff) {
              localHeaderOffset = Number(directory.readBigUInt64LE(cursor));
            }
            break;
          }
          extra += 4 + length;
        }
      }

      entries.push({
        name,
        method,
        flags,
        crc32,
        compressedSize,
        size,
        localHeaderOffset,
        isDirectory: name.endsWith('/'),
        encrypted: (flags & 0x1) !== 0,
      });
      offset = nameStart + nameLength + extraLength + commentLength;
      if (entries.length > totalEntries + 8) {
        break;
      }
    }
    if (!entries.length) {
      throw new ZipFormatError('中央目录里没有任何条目');
    }
    return entries;
  }

  /** 某一条目的解压后数据流；调用方负责消费/销毁 */
  openEntryStream(entry: ZipEntry): Readable {
    if (entry.encrypted) {
      throw new ZipFormatError(`条目已加密，无法读取: ${entry.name}`);
    }
    if (entry.compressedSize === 0 || entry.isDirectory) {
      return Readable.from([]);
    }
    const header = readAtSync(this.filePath, entry.localHeaderOffset, 30);
    if (header.readUInt32LE(0) !== LOCAL_HEADER_SIG) {
      throw new ZipFormatError(`条目的本地头损坏: ${entry.name}`);
    }
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize - 1;
    if (dataEnd >= this.fileSize) {
      throw new ZipFormatError(`条目的数据超出文件范围: ${entry.name}`);
    }
    const source = fs.createReadStream(this.filePath, { start: dataStart, end: dataEnd });
    if (entry.method === 0) {
      return source;
    }
    if (entry.method === 8) {
      const inflater = zlib.createInflateRaw();
      source.on('error', (error) => inflater.destroy(error));
      return source.pipe(inflater);
    }
    throw new ZipFormatError(`不支持的压缩方式 ${entry.method}: ${entry.name}`);
  }

  /** 把一条目解压到目标文件（先写 .part 再改名，失败不会留下半个文件） */
  async extractTo(entry: ZipEntry, destination: string): Promise<number> {
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    const temp = `${destination}.part`;
    let written = 0;
    try {
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          written += chunk.length;
          callback(null, chunk);
        },
      });
      await pipeline(this.openEntryStream(entry), counter, fs.createWriteStream(temp));
      if (entry.size > 0 && written !== entry.size) {
        throw new ZipFormatError(
          `${entry.name} 解压后大小不符（期望 ${entry.size}，实际 ${written}）`
        );
      }
      await fsp.rename(temp, destination);
      return written;
    } catch (error) {
      await fsp.rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }
}

/** 读本地头用；单独放一个函数，避免 openEntryStream 里的同步关闭逻辑 */
const readAtSync = (filePath: string, offset: number, length: number): Buffer => {
  const fd = fs.openSync(filePath, 'r');
  try {
    return readAt(fd, offset, length);
  } finally {
    fs.closeSync(fd);
  }
};
