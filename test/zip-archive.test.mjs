/**
 * ZipArchive 流式读取器测试。
 *
 * 1) 小压缩包：deflate / 存储 / 中文名 / 目录条目，逐条解压后逐字节比对；
 * 2) 超过 2 GiB 的压缩包：复现 ERR_FS_FILE_TOO_LARGE 的场景（adm-zip 在这里会崩），
 *    验证只流式读取也能解析、解压并对上 CRC；
 * 3) 如果本机有真实的 LeagueSkins 整包，解析它并抽出一条 .fantome 校验内容。
 *
 * 运行：node test/zip-archive.test.mjs [真实整包 zip 路径]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'zipArchive.mjs');
const TMP = path.join(ROOT, 'test', '.tmp');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先打包 zip-archive.ts`);
}
const { ZipArchive } = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);
const AdmZip = (await import('adm-zip')).default;

fs.mkdirSync(TMP, { recursive: true });
let failures = 0;
const check = async (name, fn) => {
  const started = Date.now();
  console.log(`  ...  ${name}`);
  try {
    const detail = await fn();
    console.log(`  ok   ${name}${detail ? ` -> ${detail}` : ''} [${Date.now() - started}ms]`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

// ==================== 1) 小压缩包 ====================

const smallZip = path.join(TMP, 'zip-small.zip');
{
  const zip = new AdmZip();
  zip.addFile('skins/1/1001/1001.fantome', Buffer.from('fantome-1'));
  zip.addFile('skins/1/1002/1002.fantome', Buffer.from('x'.repeat(4096)));
  zip.addFile('说明.txt', Buffer.from('中文条目名'));
  zip.writeZip(smallZip);
}

await check('解析小包的条目', async () => {
  const archive = await ZipArchive.open(smallZip);
  const names = archive.entries.map((entry) => entry.name).sort();
  assert.deepEqual(names, [
    'skins/1/1001/1001.fantome',
    'skins/1/1002/1002.fantome',
    '说明.txt',
  ].sort());
  const first = archive.entries.find((entry) => entry.name === 'skins/1/1001/1001.fantome');
  assert.equal(first.size, 'fantome-1'.length);
  return `${archive.entries.length} 个条目`;
});

await check('逐条解压，内容一致', async () => {
  const archive = await ZipArchive.open(smallZip);
  const out = path.join(TMP, 'zip-small-out');
  fs.rmSync(out, { recursive: true, force: true });
  const expected = {
    'skins/1/1001/1001.fantome': 'fantome-1',
    'skins/1/1002/1002.fantome': 'x'.repeat(4096),
    '说明.txt': '中文条目名',
  };
  for (const entry of archive.entries) {
    const file = path.join(out, entry.name);
    const written = await archive.extractTo(entry, file);
    assert.equal(fs.readFileSync(file, 'utf-8'), expected[entry.name]);
    assert.equal(written, Buffer.byteLength(expected[entry.name]));
  }
  fs.rmSync(out, { recursive: true, force: true });
  return 'byte-equal';
});

// ==================== 2) 超过 2 GiB ====================

/** 手写一个「存储（不压缩）」的 zip，用来造 >2 GiB 的文件 */
const writeStoredZip = (file, entries) => {
  const fd = fs.openSync(file, 'w');
  const central = [];
  let offset = 0;
  const chunk = Buffer.alloc(1024 * 1024);
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.name, 'utf-8');
      let crc = entry.crc ?? 0;
      if (!entry.crc) {
        for (let done = 0; done < entry.size; done += chunk.length) {
          crc = zlib.crc32(chunk.subarray(0, Math.min(chunk.length, entry.size - done)), crc);
        }
      }
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt32LE(crc >>> 0, 14);
      header.writeUInt32LE(entry.size, 18);
      header.writeUInt32LE(entry.size, 22);
      header.writeUInt16LE(name.length, 26);
      header.writeUInt16LE(0, 28);
      fs.writeSync(fd, header);
      fs.writeSync(fd, name);
      let written = 0;
      while (written < entry.size) {
        const slice = chunk.subarray(0, Math.min(chunk.length, entry.size - written));
        fs.writeSync(fd, entry.data ? entry.data.subarray(written, written + slice.length) : slice);
        written += slice.length;
      }
      central.push({ name, crc: crc >>> 0, size: entry.size, offset });
      offset += 30 + name.length + entry.size;
    }
    const centralStart = offset;
    for (const record of central) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt16LE(0, 14);
      header.writeUInt32LE(record.crc, 16);
      header.writeUInt32LE(record.size, 20);
      header.writeUInt32LE(record.size, 24);
      header.writeUInt16LE(record.name.length, 28);
      header.writeUInt16LE(0, 30);
      header.writeUInt16LE(0, 32);
      header.writeUInt16LE(0, 34);
      header.writeUInt16LE(0, 36);
      header.writeUInt32LE(0, 38);
      header.writeUInt32LE(record.offset, 42);
      fs.writeSync(fd, header);
      fs.writeSync(fd, record.name);
      offset += 46 + record.name.length;
    }
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(central.length, 8);
    eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(offset - centralStart, 12);
    eocd.writeUInt32LE(centralStart, 16);
    fs.writeSync(fd, eocd);
  } finally {
    fs.closeSync(fd);
  }
};

const bigZip = path.join(TMP, 'zip-big.zip');
const BIG_SIZE = Math.floor(2.2 * 1024 ** 3);
await check('造一个 >2 GiB 的压缩包', async () => {
  const entries = [];
  entries.push({ name: 'big.bin', size: BIG_SIZE });
  entries.push({ name: 'tail.txt', size: 5, data: Buffer.from('hello') });
  writeStoredZip(bigZip, entries);
  const size = fs.statSync(bigZip).size;
  assert.ok(size > 2 * 1024 ** 3, `只有 ${size} 字节`);
  return `${(size / 1024 ** 3).toFixed(2)} GB`;
});

await check('2 GiB 以上也能打开（旧实现会抛 ERR_FS_FILE_TOO_LARGE）', async () => {
  const archive = await ZipArchive.open(bigZip);
  assert.equal(archive.entries.length, 2);
  const big = archive.entries.find((entry) => entry.name === 'big.bin');
  assert.equal(big.size, BIG_SIZE);
  return `${archive.entries.length} 个条目，big.bin ${(big.size / 1024 ** 3).toFixed(2)} GB`;
});

await check('流式读取大条目，字节数与 CRC 对上', async () => {
  const archive = await ZipArchive.open(bigZip);
  const big = archive.entries.find((entry) => entry.name === 'big.bin');
  let read = 0;
  let crc = 0;
  await new Promise((resolve, reject) => {
    const stream = archive.openEntryStream(big);
    stream.on('data', (chunk) => {
      read += chunk.length;
      crc = zlib.crc32(chunk, crc);
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  assert.equal(read, BIG_SIZE);
  assert.equal(crc >>> 0, big.crc32, `CRC 不符: ${crc} vs ${big.crc32}`);
  return `${(read / 1024 ** 3).toFixed(2)} GB，CRC ${crc >>> 0}`;
});

await check('大包里的另一个条目仍能正常解压', async () => {
  const archive = await ZipArchive.open(bigZip);
  const tail = archive.entries.find((entry) => entry.name === 'tail.txt');
  const out = path.join(TMP, 'zip-big-tail.txt');
  await archive.extractTo(tail, out);
  assert.equal(fs.readFileSync(out, 'utf-8'), 'hello');
  fs.rmSync(out, { force: true });
  return 'hello';
});

fs.rmSync(bigZip, { force: true });

// ==================== 3) 真实整包 ====================

const realZip = process.argv[2] || 'C:\\Users\\18074\\Downloads\\LeagueSkins-main.zip';
if (fs.existsSync(realZip)) {
  let archive = null;
  await check('解析真实的 LeagueSkins 整包', async () => {
    const started = Date.now();
    archive = await ZipArchive.open(realZip);
    const fantomes = archive.entries.filter(
      (entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.fantome')
    );
    assert.ok(archive.entries.length > 20000, `条目只有 ${archive.entries.length}`);
    assert.ok(fantomes.length > 10000, `fantome 只有 ${fantomes.length}`);
    return `${archive.entries.length} 个条目 / ${fantomes.length} 个 fantome，` +
      `中央目录解析 ${Date.now() - started}ms`;
  });

  await check('从真实整包里抽一个 .fantome，内容仍是合法 zip', async () => {
    const entry = archive.entries.find(
      (item) => !item.isDirectory && item.name.endsWith('.fantome')
    );
    const out = path.join(TMP, 'zip-real-sample.fantome');
    const written = await archive.extractTo(entry, out);
    assert.equal(written, entry.size);
    const inner = await ZipArchive.open(out);
    const hasWad = inner.entries.some((item) => /\.wad(\.client)?$/i.test(item.name));
    const hasMeta = inner.entries.some((item) => /META\/info\.json$/i.test(item.name));
    assert.ok(hasWad, `没有 WAD 条目: ${inner.entries.map((i) => i.name).join(', ')}`);
    assert.ok(hasMeta, '没有 META/info.json');
    fs.rmSync(out, { force: true });
    return `${entry.name}（${(written / 1024 / 1024).toFixed(1)} MB，内含 ${inner.entries.length} 个条目）`;
  });

  await check('真实条目的 CRC 与落盘内容一致（导入跳过逻辑的判据）', async () => {
    const samples = archive.entries
      .filter((item) => !item.isDirectory && item.name.endsWith('.fantome'))
      .slice(0, 3);
    assert.equal(samples.length, 3, '样本不足');
    for (const entry of samples) {
      const out = path.join(TMP, `zip-crc-${path.basename(entry.name)}`);
      await archive.extractTo(entry, out);
      let crc = 0;
      for await (const chunk of fs.createReadStream(out)) {
        crc = zlib.crc32(chunk, crc);
      }
      assert.equal(crc >>> 0, entry.crc32, `${entry.name} 的 CRC 不符`);
      fs.rmSync(out, { force: true });
    }
    return `3 个样本一致`;
  });
} else {
  console.log(`  skip 真实整包（不存在: ${realZip}）`);
}

console.log(failures === 0 ? '\nZIP 读取器测试通过' : `\n${failures} 个用例失败`);
process.exit(failures === 0 ? 0 : 1);
