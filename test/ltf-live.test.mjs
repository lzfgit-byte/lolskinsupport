/**
 * 真机联调（手动运行，不随 CI）：用真实的 ltk_launcher.exe + LeagueToolFlop.dll
 * 启动本机安装的 LTK Manager，走一遍 导入 → 启用 → 启停 patcher → 卸载 → 关闭。
 *
 * 会临时往 LTK Manager 的模组库里装一个皮肤，结束时删掉；只关闭自己启动的
 * LTK Manager。不会改动 LTK Manager 的「自动检查模组」设置。
 *
 * 运行：node test/ltf-live.test.mjs [皮肤 zip 路径]
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'ltfBridge.mjs');
const LTF_DIR = path.join(ROOT, 'native', 'ltf', 'build');
const LAUNCHER = path.join(LTF_DIR, 'ltk_launcher.exe');
const DLL = path.join(LTF_DIR, 'LeagueToolFlop.dll');
const LOG_DIR = path.join(os.tmpdir(), 'ltf-live-logs');

if (!fs.existsSync(BUNDLE)) {
  throw new Error('先运行 npm run ltf:test 生成 test/.tmp/ltfBridge.mjs');
}
for (const file of [LAUNCHER, DLL]) {
  if (!fs.existsSync(file)) {
    throw new Error(`缺少 ${file}（从 Rose 安装目录拷过来，或 npm run ltf:build）`);
  }
}

const managerCandidates = [
  process.env.LTK_MANAGER_PATH,
  'C:\\Program Files\\LTK Manager\\ltk-manager.exe',
  'C:\\Program Files (x86)\\LTK Manager\\ltk-manager.exe',
].filter(Boolean);
const manager = managerCandidates.find((candidate) => fs.existsSync(candidate));
if (!manager) {
  throw new Error('没有找到 ltk-manager.exe，先安装 LTK Manager 或设置 LTK_MANAGER_PATH');
}

const skinArg = process.argv[2];
const skinRoot = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'lol-skin-ll', 'skins');
const findSkin = () => {
  if (skinArg) {
    return skinArg;
  }
  if (!fs.existsSync(skinRoot)) {
    return null;
  }
  const walk = (dir, depth) => {
    if (depth > 4) {
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
  throw new Error(`没有找到测试用的皮肤 zip（可用参数指定，默认找 ${skinRoot}）`);
}

const { LtkBridge, findBridge } = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);

const runLauncher = () =>
  new Promise((resolve, reject) => {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    execFile(
      LAUNCHER,
      ['--exe', manager, '--quiet', '--log-dir', LOG_DIR],
      { cwd: LTF_DIR, timeout: 60000, encoding: 'utf-8' },
      (error, stdout) => {
        if (error && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        const code = error && typeof error.code === 'number' ? error.code : 0;
        const match = /LTK_MANAGER_PID=(\d+)/.exec(stdout || '');
        resolve({ code, pid: match ? parseInt(match[1], 10) : null });
      }
    );
  });

const tasklistHasManager = () =>
  new Promise((resolve) => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq ltk-manager.exe', '/NH'], (error, stdout) => {
      resolve(!error && /ltk-manager/i.test(stdout || ''));
    });
  });

const staging = path.join(os.tmpdir(), 'ltf-live-staging');
const stagedArchive = () => {
  fs.mkdirSync(staging, { recursive: true });
  const dest = path.join(staging, 'live_check.fantome');
  fs.rmSync(dest, { force: true });
  try {
    fs.linkSync(skin, dest);
  } catch {
    fs.copyFileSync(skin, dest);
  }
  return dest;
};

const waitPatcher = async (bridge, running, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = (await bridge.patcherStatus())?.response?.value;
    if (value && value.running === running) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`patcher 没有在 ${timeoutMs / 1000}s 内变成 running=${running}`);
};

let managerPid = null;
let bridge = null;
let tracked = null;
let failures = 0;

const step = async (name, fn) => {
  try {
    const value = await fn();
    console.log(`  ok   ${name}${value === undefined ? '' : ` -> ${value}`}`);
    return value;
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
    return undefined;
  }
};

try {
  if (await tasklistHasManager()) {
    throw new Error('LTK Manager 已经在运行，先关掉它再跑（桥只注入 launcher 启动的实例）');
  }

  console.log(`启动器: ${LAUNCHER}`);
  console.log(`管理器: ${manager}`);
  console.log(`皮肤  : ${skin}`);

  const launched = await step('launcher 启动并注入', async () => {
    const result = await runLauncher();
    if (result.code !== 0) {
      throw new Error(`退出码 ${result.code}`);
    }
    if (!result.pid) {
      throw new Error('没有拿到 LTK_MANAGER_PID');
    }
    managerPid = result.pid;
    return `pid=${managerPid}`;
  });
  if (launched === undefined) {
    throw new Error('launcher 没起来，后面不用测了');
  }

  bridge = await step('等桥就绪', async () => {
    const found = await findBridge(managerPid);
    if (!found) {
      throw new Error('30 秒内没有发现桥');
    }
    return new LtkBridge(found.port, found.hello.pid);
  });
  if (!bridge) {
    throw new Error('桥没起来');
  }

  console.log(`  info 桥版本 ${(await bridge.hello()).version}`);

  await step('hello / ping', async () => {
    if ((await bridge.hello()).service !== 'LTKBridge') {
      throw new Error('hello 异常');
    }
    if (!(await bridge.ping()).ok) {
      throw new Error('ping 失败');
    }
  });

  await step('读模组库', async () => `${(await bridge.library()).length} 个模组`);

  tracked = await step('导入皮肤压缩包', async () => {
    const response = await bridge.importArchive(stagedArchive(), 'lolskinsupport-live-check');
    const value = response?.response?.value;
    const mod = value?.mod ?? value;
    if (!mod?.id) {
      throw new Error(`导入应答里没有条目: ${JSON.stringify(response).slice(0, 300)}`);
    }
    const before = (await bridge.library()).find((item) => String(item.id) === String(mod.id));
    return {
      id: String(mod.id),
      created: value?.kind === 'installed' || !before,
      kind: value?.kind ?? 'installed',
      wasEnabled: before?.enabled === true,
    };
  });
  if (!tracked) {
    throw new Error('导入失败');
  }

  await step('启用该模组', async () => {
    await bridge.toggle(tracked.id, true);
    const entry = (await bridge.library()).find((item) => String(item.id) === tracked.id);
    if (!entry || entry.enabled !== true) {
      throw new Error('开关没有生效');
    }
  });

  await step('启动 patcher', async () => {
    await bridge.startPatcher();
    await waitPatcher(bridge, true);
  });

  await step('停 patcher', async () => {
    await bridge.stopPatcher();
    await waitPatcher(bridge, false);
  });

  await step('撤掉测试模组', async () => {
    if (tracked.created) {
      await bridge.uninstall(tracked.id);
    } else {
      await bridge.toggle(tracked.id, tracked.wasEnabled);
    }
    tracked = null;
  });
} finally {
  // 收尾：没撤掉的模组撤掉，然后关闭自己启动的 LTK Manager
  try {
    if (bridge && tracked) {
      if (tracked.created) {
        await bridge.uninstall(tracked.id).catch(() => {});
      } else {
        await bridge.toggle(tracked.id, tracked.wasEnabled).catch(() => {});
      }
    }
    if (bridge) {
      await bridge.stopPatcher().catch(() => {});
      await bridge.kill().catch(() => {});
    }
  } finally {
    if (managerPid) {
      await new Promise((resolve) => {
        execFile('taskkill', ['/PID', `${managerPid}`, '/T', '/F'], () => resolve());
      });
    }
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? '\n真机联调通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
