/**
 * 注入会话的真机测试（手动运行）：直接驱动 ltfInjector，而不只是桥。
 *
 * 覆盖：启动 LTK Manager → 导入皮肤 → 只启用它 → 启动 patcher → 停止并清理 →
 * 状态文件、模组库、进程三处的收尾。
 *
 * 前提：已安装 LTK Manager，native/ltf/build 里有 LTF 桥，本机有至少一个皮肤 zip。
 * 运行：node test/ltf-session.test.mjs [皮肤 zip 路径]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_BUNDLE = path.join(ROOT, 'test', '.tmp', 'ltfSession.mjs');
const BRIDGE_BUNDLE = path.join(ROOT, 'test', '.tmp', 'ltfBridge.mjs');
const LTF_DIR = path.join(ROOT, 'native', 'ltf', 'build');
const USER_DATA = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'lol-skin-ll');
const STATE_FILE = path.join(USER_DATA, 'ltf_session.json');

for (const file of [SESSION_BUNDLE, BRIDGE_BUNDLE]) {
  if (!fs.existsSync(file)) {
    throw new Error(`缺少 ${file}，先运行 npm run ltf:test / ltf:session:test 的构建步骤`);
  }
}
for (const name of ['ltk_launcher.exe', 'LeagueToolFlop.dll']) {
  if (!fs.existsSync(path.join(LTF_DIR, name))) {
    throw new Error(`缺少 ${name}：从 Rose 安装目录拷到 native/ltf/build/，或 npm run ltf:build`);
  }
}

const { ltfInjector } = await import(`file:///${SESSION_BUNDLE.replace(/\\/g, '/')}`);
const { LtkBridge, findBridge } = await import(`file:///${BRIDGE_BUNDLE.replace(/\\/g, '/')}`);

const skinArg = process.argv[2];
const skinRoot = path.join(USER_DATA, 'skins');
const findSkin = () => {
  if (skinArg) {
    return skinArg;
  }
  const walk = (dir, depth) => {
    if (depth > 4 || !fs.existsSync(dir)) {
      return null;
    }
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isFile() && name.endsWith('.zip')) {
        return full;
      }
      if (stat.isDirectory()) {
        const found = walk(full, depth + 1);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };
  return walk(skinRoot, 0);
};
const skin = findSkin();
if (!skin) {
  throw new Error(`没有找到皮肤 zip（可用参数指定，默认找 ${skinRoot}）`);
}

const managerRunning = () =>
  new Promise((resolve) => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq ltk-manager.exe', '/NH'], (error, stdout) => {
      resolve(!error && /ltk-manager/i.test(stdout || ''));
    });
  });

const withBridge = async (fn) => {
  const found = await findBridge();
  if (!found) {
    throw new Error('没有桥可连（LTK Manager 不是由 launcher 启动的？）');
  }
  const bridge = new LtkBridge(found.port, found.hello.pid);
  return fn(bridge);
};

let failures = 0;
const step = async (name, fn) => {
  try {
    const value = await fn();
    console.log(`  ok   ${name}${value === undefined ? '' : ` -> ${value}`}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

if (await managerRunning()) {
  throw new Error('LTK Manager 已经在运行，先关掉它再跑');
}

console.log(`皮肤: ${skin}`);
console.log(`数据目录: ${USER_DATA}`);

const applied = await step('applySkins 注入一个皮肤', async () => {
  const result = await ltfInjector.applySkins([{ archive: skin, heroId: '1', skinId: '1' }]);
  assert.equal(result.ok, true, result.error);
  assert.equal(ltfInjector.isRunning(), true, '注入状态应该是运行中');
  return true;
});

await step('模组库里只有一个启用中的本次皮肤', async () => {
  const entries = await withBridge((bridge) => bridge.library());
  assert.equal(entries.length, 1, `库里条目数 ${entries.length}`);
  assert.equal(entries[0].enabled, true);
  return entries[0].displayName;
});

await step('状态文件记录了本次导入', async () => {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  assert.equal(state.imports.length, 1);
  assert.equal(state.imports[0].created, true);
  assert.equal(state.startedByUs, true);
  return `pid=${state.managerPid}`;
});

await step('stop() 收拾干净', async () => {
  await ltfInjector.stop();
  assert.equal(ltfInjector.isRunning(), false);
  assert.equal(fs.existsSync(STATE_FILE), false, '状态文件应该被删掉');
  assert.equal(await managerRunning(), false, '自己启动的 LTK Manager 应该被关闭');
});

await step('可以再来一次（不残留）', async () => {
  const second = await ltfInjector.applySkins([{ archive: skin, heroId: '1', skinId: '1' }]);
  assert.equal(second.ok, true, second.error);
  const entries = await withBridge((bridge) => bridge.library());
  assert.equal(entries.length, 1);
  await ltfInjector.stop();
  assert.equal(await managerRunning(), false);
  return applied === true ? 'repeatable' : 'repeatable';
});

// 兜底：万一上面失败留下了进程/状态
if (await managerRunning()) {
  await ltfInjector.stop().catch(() => {});
}

console.log(failures === 0 ? '\n会话测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
