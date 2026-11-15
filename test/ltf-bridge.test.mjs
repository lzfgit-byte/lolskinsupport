/**
 * LTKBridge 客户端协议的自动化测试（不需要真的 LTK Manager）。
 *
 * 用一个假桥服务器复现 DLL 的行为：hello / ping / list / import / toggle /
 * uninstall / start_patcher / stop_patcher / patcher_status / health_check_off，
 * 令牌不对时回 unauthorized。然后跑真实的 ltfBridge.ts 客户端。
 *
 * 运行：node test/ltf-bridge.test.mjs
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'ltfBridge.mjs');
const TOKEN = 'test-token-1234';
const PORT = 46339;
const BRIDGE_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'LTKBridge');

if (!fs.existsSync(BUNDLE)) {
  throw new Error(`先把 ltfBridge.ts 打包到 ${BUNDLE}（参见 npm run ltf:test）`);
}

const { LtkBridge, findBridge, BridgeCommandError } = await import(
  `file:///${BUNDLE.replace(/\\/g, '/')}`
);

// ==================== 假桥 ====================

const library = [{ id: 'user-mod', name: 'Map', displayName: 'Map', enabled: true }];
let nextImport = 1;
let patcherRunning = false;
const seen = [];

const handle = (req) => {
  seen.push(req.cmd);
  if (req.cmd === 'hello') {
    return { ok: true, service: 'LTKBridge', pid: process.pid, version: '1.0.0' };
  }
  if (req.cmd === 'ping') {
    return { ok: true };
  }
  if (req.token !== TOKEN) {
    return { ok: false, error: 'unauthorized: bad token' };
  }
  switch (req.cmd) {
    case 'list':
      return { ok: true, library: library.map((entry) => ({ ...entry })) };
    case 'import': {
      const id = `imported-${nextImport++}`;
      const name = req.name || path.basename(req.path || 'mod.fantome');
      library.push({ id, name, displayName: name, enabled: true });
      return { ok: true, response: { value: { id, enabled: true } } };
    }
    case 'toggle': {
      const entry = library.find((item) => item.id === req.target);
      if (!entry) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'no such mod' } };
      }
      entry.enabled = req.enabled === true;
      return { ok: true };
    }
    case 'uninstall': {
      const index = library.findIndex((item) => item.id === req.target);
      if (index < 0) {
        return { ok: false, error: { code: 'NOT_FOUND' } };
      }
      library.splice(index, 1);
      return { ok: true };
    }
    case 'start_patcher':
      if (patcherRunning) {
        return { ok: false, error: { code: 'PATCHER', error: { kind: 'ALREADY_RUNNING' } } };
      }
      patcherRunning = true;
      return { ok: true };
    case 'stop_patcher':
      patcherRunning = false;
      return { ok: true };
    case 'patcher_status':
      return { ok: true, response: { value: { running: patcherRunning } } };
    case 'health_check_off':
      return { ok: true, changed: true };
    case 'kill':
      return { ok: true };
    default:
      return { ok: false, error: `unknown cmd ${req.cmd}` };
  }
};

const server = net.createServer((socket) => {
  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf-8');
    const index = buffer.indexOf('\n');
    if (index < 0) {
      return;
    }
    const req = JSON.parse(buffer.slice(0, index));
    socket.write(`${JSON.stringify(handle(req))}\n`);
  });
  socket.on('error', () => {});
});

// ==================== 准备令牌 / 端口文件 ====================

fs.mkdirSync(BRIDGE_DIR, { recursive: true });
const tokenFile = path.join(BRIDGE_DIR, 'token.txt');
const portFile = path.join(BRIDGE_DIR, 'port.txt');
const hadToken = fs.existsSync(tokenFile);
const hadPort = fs.existsSync(portFile);
const oldToken = hadToken ? fs.readFileSync(tokenFile) : null;
const oldPort = hadPort ? fs.readFileSync(portFile) : null;
fs.writeFileSync(tokenFile, TOKEN, 'ascii');
fs.writeFileSync(portFile, String(PORT), 'ascii');

const cleanup = () => {
  if (hadToken) {
    fs.writeFileSync(tokenFile, oldToken);
  } else {
    fs.rmSync(tokenFile, { force: true });
  }
  if (hadPort) {
    fs.writeFileSync(portFile, oldPort);
  } else {
    fs.rmSync(portFile, { force: true });
  }
  server.close();
};

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

/** 本机有真的 LTK Manager 在跑时，全局桥（注册表里的那个）属于它，别去抢 */
const realManagerRunning = await new Promise((resolve) => {
  execFile('tasklist', ['/FI', 'IMAGENAME eq ltk-manager.exe', '/NH'], (error, stdout) => {
    resolve(!error && /ltk-manager/i.test(stdout || ''));
  });
});

try {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  if (realManagerRunning) {
    console.log('  skip 发现桥的用例：本机有真的 LTK Manager 在运行，注册表指向它');
  } else {
    await check('发现桥并按 pid 过滤', async () => {
      const found = await findBridge();
      assert.ok(found, '没有找到桥');
      assert.equal(found.port, PORT);
      assert.equal(found.hello.pid, process.pid);
      const wrongPid = await findBridge(process.pid + 1);
      assert.equal(wrongPid, null, 'pid 不符时不该认');
    });
  }

  // 命令本身用显式端口，不受本机真实桥的影响
  const bridge = new LtkBridge(PORT, process.pid);
  await bridge.connect();

  await check('hello / ping', async () => {
    assert.equal((await bridge.hello()).service, 'LTKBridge');
    assert.equal((await bridge.ping()).ok, true);
    assert.equal(await bridge.alive(), true);
  });

  await check('读模组库', async () => {
    const entries = await bridge.library();
    assert.deepEqual(
      entries.map((entry) => [entry.id, entry.enabled]),
      [['user-mod', true]]
    );
  });

  await check('导入压缩包并拿到新条目 id', async () => {
    const response = await bridge.importArchive('C:\\tmp\\Annie_1.fantome', 'Annie_1');
    assert.equal(response.response.value.id, 'imported-1');
    const entries = await bridge.library();
    assert.ok(
      entries.some((entry) => entry.id === 'imported-1' && entry.displayName === 'Annie_1')
    );
  });

  await check('开关与卸载', async () => {
    await bridge.toggle('imported-1', false);
    assert.equal((await bridge.library()).find((e) => e.id === 'imported-1').enabled, false);
    await bridge.uninstall('imported-1');
    assert.ok(!(await bridge.library()).some((e) => e.id === 'imported-1'));
  });

  await check('patcher 启停与 ALREADY_RUNNING 报错', async () => {
    await bridge.startPatcher();
    const status = (await bridge.patcherStatus()).response.value;
    assert.equal(status.running, true);
    await assert.rejects(
      () => bridge.startPatcher(),
      (error) => error instanceof BridgeCommandError && /ALREADY_RUNNING/.test(error.message)
    );
    await bridge.stopPatcher();
    assert.equal((await bridge.patcherStatus()).response.value.running, false);
  });

  await check('health_check_off 返回 changed', async () => {
    assert.equal((await bridge.healthCheckOff()).changed, true);
  });

  await check('令牌错误时报 unauthorized，命令失败可见', async () => {
    fs.writeFileSync(tokenFile, 'stale-token', 'ascii');
    fs.writeFileSync(portFile, String(PORT), 'ascii');
    const other = new LtkBridge(PORT, process.pid);
    await assert.rejects(() => other.toggle('user-mod', false), /unauthorized/);
    fs.writeFileSync(tokenFile, TOKEN, 'ascii');
  });

  await check('服务器只收到预期的命令序列', async () => {
    assert.ok(seen.includes('hello'));
    assert.ok(seen.includes('import'));
    assert.ok(seen.includes('start_patcher'));
  });
} finally {
  cleanup();
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 个用例失败`);
process.exit(failures === 0 ? 0 : 1);
