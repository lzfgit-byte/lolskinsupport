/**
 * 皮肤自动同步的测试（全部走本机临时目录和假服务器，不碰真实数据）。
 *
 * 覆盖：清单解析、目标路径、代理生效、首次下载、无变化不重下、上游变化才下载、
 * 「首次只补缺失」的认领逻辑、强制全量重下。
 *
 * 运行：npm run skin:test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'test', '.tmp', 'skinSync.mjs');
if (!fs.existsSync(BUNDLE)) {
  throw new Error(`缺少 ${BUNDLE}，先运行 npm run skin:test 的构建步骤`);
}

// ---------- 假仓库：清单 + 文件 ----------
const files = {
  'skins/1/1001/1001.fantome': Buffer.from('first-skin-v1'),
  'skins/8/8003/8003.fantome': Buffer.from('vladimir-skin-v1'),
  'classic/60001/1001/1001.fantome': Buffer.from('classic-ignored'),
};
let commit = 'test-commit-1';
const blobSha = (buffer) =>
  createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
const manifestBody = () => ({
  version: 1,
  commit,
  files: Object.entries(files).map(([p, buffer]) => [p, blobSha(buffer), buffer.length]),
});

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

const fileServer = http.createServer((req, res) => {
  if (req.url === '/manifest/manifest.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(manifestBody()));
    return;
  }
  // raw.githubusercontent.com/<repo>/<ref>/<path>：少了 ref 这一段 GitHub 会回 404，
  // 假服务器也照着来，避免「URL 拼错但测试照过」。
  const parts = decodeURIComponent(req.url.replace(/^\//, '')).split('/');
  const ref = parts.shift();
  if (ref !== commit) {
    res.writeHead(404);
    res.end('not found: missing or wrong ref');
    return;
  }
  const key = parts.join('/');
  const body = files[key];
  if (!body) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': body.length });
  res.end(body);
});

// ---------- 假代理：统计命中并转发绝对 URI ----------
let proxyHits = 0;
let proxyFileGets = 0;
const proxyServer = http.createServer((req, res) => {
  proxyHits++;
  let target;
  try {
    target = new URL(req.url);
  } catch {
    res.writeHead(400);
    res.end('proxy expects absolute URI');
    return;
  }
  if (target.pathname.endsWith('.fantome')) {
    proxyFileGets++;
  }
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    }
  );
  upstream.on('error', () => {
    res.writeHead(502);
    res.end('proxy upstream error');
  });
  req.pipe(upstream);
});

const filePort = await listen(fileServer);
const proxyPort = await listen(proxyServer);
const base = `http://127.0.0.1:${filePort}`;
const proxyUrl = `http://127.0.0.1:${proxyPort}`;

// ---------- 隔离的数据目录 + 配置 ----------
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skin-sync-data-'));
const skinRoot = path.join(dataDir, 'skins');
fs.mkdirSync(path.join(skinRoot, 'wad_skins'), { recursive: true });
fs.writeFileSync(
  path.join(dataDir, 'config.json'),
  JSON.stringify(
    {
      SKIN_PATH: skinRoot,
      SKIN_DEFAULT_SUFFIX: 'wad_skins',
      SKIN_SYNC_PROXY: proxyUrl,
      SKIN_SYNC_MISSING_ONLY: true,
      SKIN_SYNC_ENABLED: false,
      SKIN_SYNC_INTERVAL_MIN: 60,
    },
    null,
    2
  ),
  'utf-8'
);

process.env.LOL_SKIN_DATA_DIR = dataDir;
process.env.LOL_SKIN_SYNC_MANIFEST_URL = `${base}/manifest/manifest.json`;
process.env.LOL_SKIN_SYNC_RAW_BASE = base;

const {
  syncSkinsNow,
  parseProxyUrl,
  parseManifest,
  syncTargetPath,
  planSync,
  getSkinSyncState,
  setSkinSyncSettings,
  startSkinSyncMonitor,
  testSkinSyncProxy,
} = await import(`file:///${BUNDLE.replace(/\\/g, '/')}`);

const targetOf = (repoPath) =>
  syncTargetPath(skinRoot, 'wad_skins', repoPath).target.replace(/\\/g, '/');
const readText = (repoPath) => fs.readFileSync(targetOf(repoPath), 'utf-8');

let failures = 0;
const step = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`  ok   ${name}${detail === undefined ? '' : ` -> ${detail}`}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
};

try {
  await step('代理地址解析', () => {
    assert.deepEqual(parseProxyUrl('http://127.0.0.1:10808'), {
      protocol: 'http',
      host: '127.0.0.1',
      port: 10808,
      auth: undefined,
    });
    assert.equal(parseProxyUrl('127.0.0.1:7890').port, 7890);
    assert.equal(parseProxyUrl('socks5://127.0.0.1:1080'), null);
    assert.equal(parseProxyUrl(''), null);
    return 'http / 无协议 / 不支持的类型';
  });

  await step('清单解析 + 目标路径映射', () => {
    const parsed = parseManifest(manifestBody());
    assert.equal(parsed.files.length, 3);
    assert.equal(parsed.commit, commit);
    assert.equal(
      targetOf('skins/8/8003/8003.fantome'),
      `${skinRoot.replace(/\\/g, '/')}/wad_skins/8/8_3.zip`
    );
    assert.equal(syncTargetPath(skinRoot, 'wad_skins', 'classic/60001/1001/1001.fantome'), null);
    return '3 条，classic 被忽略';
  });

  await step('首次同步：下载缺失的皮肤（走代理）', async () => {
    const hitsBefore = proxyHits;
    const result = await syncSkinsNow();
    assert.equal(result.ok, true, result.error);
    assert.equal(result.downloaded, 2, `downloaded=${result.downloaded}`);
    assert.equal(result.failed, 0);
    assert.ok(proxyHits > hitsBefore, '请求应该经过代理');
    assert.equal(proxyFileGets, 2, `代理应该转发 2 个文件，实际 ${proxyFileGets}`);
    assert.equal(readText('skins/1/1001/1001.fantome'), 'first-skin-v1');
    assert.equal(readText('skins/8/8003/8003.fantome'), 'vladimir-skin-v1');
    return `2 个文件，${result.bytes} 字节`;
  });

  await step('没有变化：不重复下载', async () => {
    const getsBefore = proxyFileGets;
    const result = await syncSkinsNow();
    assert.equal(result.ok, true, result.error);
    assert.equal(result.downloaded, 0);
    assert.equal(result.adopted, 0);
    assert.equal(proxyFileGets, getsBefore, '没有变化时不该再下载文件');
    return '0 下载';
  });

  await step('上游文件变化：只下载变化的那一个', async () => {
    files['skins/1/1001/1001.fantome'] = Buffer.from('first-skin-v2');
    commit = 'test-commit-2';
    const result = await syncSkinsNow();
    assert.equal(result.ok, true, result.error);
    assert.equal(result.downloaded, 1, `downloaded=${result.downloaded}`);
    assert.equal(readText('skins/1/1001/1001.fantome'), 'first-skin-v2');
    assert.equal(readText('skins/8/8003/8003.fantome'), 'vladimir-skin-v1');
    return '1 下载';
  });

  await step('首次只补缺失：本地已有但没有记录的直接认领，不重下', async () => {
    fs.rmSync(path.join(dataDir, 'skin_sync_state.json'), { force: true });
    const vladimir = targetOf('skins/8/8003/8003.fantome');
    fs.writeFileSync(vladimir, 'local-imported-copy', 'utf-8');
    const getsBefore = proxyFileGets;
    const result = await syncSkinsNow();
    assert.equal(result.ok, true, result.error);
    assert.equal(result.downloaded, 0, `downloaded=${result.downloaded}`);
    assert.equal(result.adopted, 2, `adopted=${result.adopted}`);
    assert.equal(proxyFileGets, getsBefore);
    assert.equal(fs.readFileSync(vladimir, 'utf-8'), 'local-imported-copy', '认领时不能覆盖本地文件');
    return '认领 2 个';
  });

  await step('认领之后上游变化：正常下载并覆盖', async () => {
    files['skins/8/8003/8003.fantome'] = Buffer.from('vladimir-skin-v2');
    commit = 'test-commit-3';
    const result = await syncSkinsNow();
    assert.equal(result.ok, true, result.error);
    assert.equal(result.downloaded, 1, `downloaded=${result.downloaded}`);
    assert.equal(readText('skins/8/8003/8003.fantome'), 'vladimir-skin-v2');
    return '1 下载';
  });

  await step('强制全量：不看记录，重新下载并校验所有皮肤', async () => {
    const getsBefore = proxyFileGets;
    const result = await syncSkinsNow(true);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.downloaded, 2, `downloaded=${result.downloaded}`);
    assert.equal(proxyFileGets - getsBefore, 2);
    return '2 下载';
  });

  await step('planSync：只算 skins/ 下可识别的条目', () => {
    const parsed = parseManifest(manifestBody());
    const plan = planSync(
      parsed,
      { version: 1, targetRoot: '', suffix: '', commit: '', updatedAt: '', files: {} },
      skinRoot,
      'wad_skins',
      { missingOnly: false }
    );
    assert.equal(plan.items.length, 2);
    assert.equal(plan.ignored, 1);
    return '2 个待下载 / 1 个忽略';
  });

  await step('本地文件被改过：下次同步能发现并还原', async () => {
    const target = targetOf('skins/8/8003/8003.fantome');
    fs.writeFileSync(target, 'user-edited-locally', 'utf-8');
    const result = await syncSkinsNow();
    assert.equal(result.ok, true, result.error);
    assert.equal(result.localChanged, 1, `localChanged=${result.localChanged}`);
    assert.equal(result.downloaded, 1, `downloaded=${result.downloaded}`);
    assert.equal(fs.readFileSync(target, 'utf-8'), 'vladimir-skin-v2', '应该还原成仓库版本');
    return '检测到 1 个本地改动';
  });

  await step('老状态文件（没有 localSize）：靠 mtime 也能发现改动', async () => {
    const stateFile = path.join(dataDir, 'skin_sync_state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    const key = 'skins/8/8003/8003.fantome';
    const target = targetOf(key);
    // 模拟旧版本记录：只有 sha/size/at，at 是 1 分钟前
    state.files[key] = {
      sha: state.files[key].sha,
      size: state.files[key].size,
      at: new Date(Date.now() - 60_000).toISOString(),
    };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.writeFileSync(target, 'vladimir-skin-v2', 'utf-8');
    const future = new Date(Date.now() + 5_000);
    fs.utimesSync(target, future, future);
    const result = await syncSkinsNow();
    assert.equal(result.ok, true, result.error);
    assert.equal(result.localChanged, 1, `localChanged=${result.localChanged}`);
    assert.equal(result.downloaded, 1, `downloaded=${result.downloaded}`);
    return 'mtime 判定生效';
  });

  await step('测试代理：只拉清单，不下载文件', async () => {
    const getsBefore = proxyFileGets;
    const probe = await testSkinSyncProxy();
    assert.equal(probe.ok, true, probe.error);
    assert.equal(probe.viaProxy, true);
    assert.equal(probe.entries, 3);
    assert.equal(proxyFileGets, getsBefore, '测试代理不应该下载皮肤文件');
    return `${probe.entries} 条，${probe.ms} ms`;
  });

  await step('设置与定时器：保存后重新排期，关掉后停止', () => {
    assert.equal(getSkinSyncState().nextCheckAt, 0, '默认配置里自动同步是关的');
    startSkinSyncMonitor();
    assert.equal(getSkinSyncState().nextCheckAt, 0, '未启用时不应该排期');
    const enabled = setSkinSyncSettings({
      enabled: true,
      proxy: proxyUrl,
      intervalMin: 5,
      missingOnly: true,
    });
    assert.ok(enabled.nextCheckAt > Date.now(), '启用后应该有下一次检查时间');
    assert.equal(enabled.settings.intervalMin, 5);
    const config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8'));
    assert.equal(config.SKIN_SYNC_ENABLED, true);
    assert.equal(config.SKIN_SYNC_PROXY, proxyUrl);
    const disabled = setSkinSyncSettings({ enabled: false });
    assert.equal(disabled.nextCheckAt, 0);
    return '排期 / 停止';
  });
} finally {
  fileServer.close();
  proxyServer.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n皮肤同步测试通过' : `\n${failures} 个环节失败`);
process.exit(failures === 0 ? 0 : 1);
