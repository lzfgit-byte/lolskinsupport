/**
 * ritobin-tools 批量转换的测试（不依赖游戏文件）：哈希算法、精简名字表目录、
 * 「锚点没解出来就退回随包完整表」的分支、新旧命令行参数的拼法。
 *
 * 运行：node test/ritobin.test.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'ritobin.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先打包 electron/export/ritobin.ts`);
}
const {
  RITOBIIN_NAMES,
  ritobinHash,
  ensureRitobinHashDir,
  ritobinHashTablesDir,
  convertBinsToPy,
  convertPyToBins,
} = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);

let failures = 0;
const check = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`  ok   ${name}${detail ? ` -> ${detail}` : ''}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

await check('FNV-1a 32 + 小写：与 ritobin 的 hashes.*.txt 一致', () => {
  // 这两组取自 tools/ritobin/bin/hashes/hashes.binfields.txt / bintypes.txt
  assert.equal(ritobinHash('AFKDetection2'), 'e4460934');
  assert.equal(ritobinHash('ASSETS'), 'a2564d38');
  assert.equal(ritobinHash('SkinCharacterDataProperties'), '9b67e9f6');
  assert.equal(ritobinHash('championSkinName'), '2d78c328');
  // 大小写不敏感（表里存的就是小写算出来的值）
  assert.equal(ritobinHash('ChampionSkinName'), ritobinHash('championskinname'));
  return '4 组';
});

await check('精简名字表：三个固定文件名都写了，内容是「哈希 名字」', () => {
  const dir = ensureRitobinHashDir();
  assert.ok(dir, '应该返回目录');
  for (const fileName of ['hashes.binfields.txt', 'hashes.bintypes.txt', 'hashes.binentries.txt']) {
    const file = path.join(dir, fileName);
    assert.ok(fs.existsSync(file), `缺少 ${fileName}`);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, RITOBIIN_NAMES.length);
    for (const line of lines) {
      assert.match(line, /^[0-9a-f]{8} \S+$/, `格式不对: ${line}`);
    }
  }
  return `${RITOBIIN_NAMES.length} 条 x3`;
});

const workDir = path.join(os.tmpdir(), 'ritobin-test-work');
const makeWork = () => {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(workDir, 'skin', 'vayne'), { recursive: true });
  fs.writeFileSync(path.join(workDir, 'skin', 'vayne', 'skin11.bin'), Buffer.from('fake'));
  return workDir;
};

await check('精简名字表能解出锚点：只调一次，不退回完整表', async () => {
  const dir = makeWork();
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    // 模拟 ritobin-tools：-H 指到精简表时解出名字
    fs.writeFileSync(path.join(dir, 'skin', 'vayne', 'skin11.py'), 'championSkinName: string = "VayneBase"\nSkinCharacterDataProperties {');
  };
  const result = await convertBinsToPy(run, dir);
  const args = calls[0];
  assert.equal(calls.length, 1, '只该调一次');
  assert.equal(args[0], '-H', '前置参数该是 -H <表目录>');
  assert.equal(args[1], ensureRitobinHashDir(), '该用精简名字表目录');
  assert.ok(args.includes('--hashtable-dir'), '该屏蔽 LTK 共享缓存');
  assert.ok(args.includes('convert'), '新工具要带 convert 子命令');
  assert.ok(args.includes('-r'), '批量要递归');
  assert.deepEqual(args.slice(-2), ['--ext', 'py'], '输出扩展名要是 .py');
  assert.equal(result.slimHashes, true);
  assert.equal(result.count, 1);
  return `${result.elapsedMs}ms`;
});

await check('锚点没解出来：删掉 py 并用随包完整表重转一次', async () => {
  const dir = makeWork();
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    const slim = args[1] === ensureRitobinHashDir();
    fs.writeFileSync(
      path.join(dir, 'skin', 'vayne', 'skin11.py'),
      slim ? '0x2d78c328: string = "VayneBase"' : 'championSkinName: string = "VayneBase"\nSkinCharacterDataProperties {'
    );
  };
  const logs = [];
  const result = await convertBinsToPy(run, dir, (message) => logs.push(message));
  assert.equal(calls.length, 2, '先精简表再完整表');
  assert.equal(calls[1][1], ritobinHashTablesDir(), '第二次该用随包完整名字表');
  assert.equal(result.slimHashes, false);
  assert.ok(logs.some((line) => line.includes('完整名字表')), '应该有回退日志');
  return '回退正常';
});

await check('py→bin 批量：不带名字表参数（反向不需要）', async () => {
  const dir = makeWork();
  fs.writeFileSync(path.join(dir, 'skin', 'vayne', 'skin11.py'), 'championSkinName: string = "x"');
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    fs.writeFileSync(path.join(dir, 'skin', 'vayne', 'skin11.bin'), Buffer.from('bin'));
  };
  const result = await convertPyToBins(run, dir);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('convert') && calls[0].includes('-r'));
  assert.deepEqual(calls[0].slice(-2), ['--to', 'bin']);
  assert.ok(!calls[0].includes('-H') && !calls[0].includes('--hashtable-dir'));
  assert.equal(result.count, 1);
  return `${result.elapsedMs}ms`;
});

fs.rmSync(workDir, { recursive: true, force: true });
console.log(failures === 0 ? '\nritobin 批量转换测试通过' : `\n${failures} 个用例失败`);
process.exit(failures === 0 ? 0 : 1);
