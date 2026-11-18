/**
 * 皮肤自动同步 —— 定时检查 LeagueSkins 仓库的清单，把新增/变化的皮肤下载到本地。
 *
 * 数据来源与 Rose 一致：GitHub 仓库 `Alban1911/LeagueSkins` 的 `manifest` 分支
 * （清单里是 `[路径, git blob SHA, 大小]`），文件走 raw.githubusercontent.com，
 * 按 SHA 判断是否变化，只下载有变化的条目。所有请求都可以走配置里的 HTTP 代理
 * （默认 `http://127.0.0.1:10808`），代理挂了就报错，不会偷偷直连。
 *
 * 落盘位置与「导入 LeagueSkins 整包」完全一致：
 *   skins/<英雄>/<皮肤>/<皮肤>.fantome -> <SKIN_PATH>/<后缀>/<英雄>/<英雄>_<序号>.zip
 *
 * 状态文件 `skin_sync_state.json` 记录每个条目已下载的 SHA。本地已有、但状态里
 * 没有记录的皮肤（例如用户之前用整包导入的），在 `SKIN_SYNC_MISSING_ONLY` 开启时
 * 直接「认领」而不重下 —— 否则第一次同步会白下 4 GB；关掉它就以仓库为准全部校验。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import axios, { type AxiosInstance } from 'axios';
import { LogMsgUtil, ProgressMsgUtil } from '../utils/message';
import { readJsonConfig, writeJsonConfig } from '../utils/json-config';
import { parseLeagueSkinsEntry } from './league-skins-import';

// ==================== 常量 ====================

export const SKIN_SYNC_KEYS = {
  enabled: 'SKIN_SYNC_ENABLED',
  proxy: 'SKIN_SYNC_PROXY',
  intervalMin: 'SKIN_SYNC_INTERVAL_MIN',
  missingOnly: 'SKIN_SYNC_MISSING_ONLY',
} as const;

export const SKIN_SYNC_REPO = 'Alban1911/LeagueSkins';
export const DEFAULT_SKIN_SYNC_PROXY = 'http://127.0.0.1:10808';
const DEFAULT_INTERVAL_MIN = 30;
/** 主进程起来后先等一会儿再第一次检查，别和应用启动抢磁盘 */
const FIRST_CHECK_DELAY_MS = 20_000;
const DOWNLOAD_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 60_000;
const USER_AGENT = 'lolskinsupport-skin-sync/1.0';
const PROGRESS_KEY = 'skin-sync';
const STATE_VERSION = 1;
/** 下载前至少留这么多空间，别把盘写满 */
const DISK_RESERVE_BYTES = 1024 * 1024 * 1024;

const manifestUrl = (): string =>
  process.env.LOL_SKIN_SYNC_MANIFEST_URL ||
  `https://raw.githubusercontent.com/${SKIN_SYNC_REPO}/manifest/manifest.json`;

const rawBase = (): string =>
  process.env.LOL_SKIN_SYNC_RAW_BASE || `https://raw.githubusercontent.com/${SKIN_SYNC_REPO}`;

const userDataDir = (): string =>
  process.env.LOL_SKIN_DATA_DIR ||
  path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'lol-skin-ll');

const configPath = (): string => path.join(userDataDir(), 'config.json');
const statePath = (): string => path.join(userDataDir(), 'skin_sync_state.json');

// ==================== 类型 ====================

export interface SkinSyncEntry {
  /** 仓库里的相对路径，例如 skins/1/1001/1001.fantome */
  path: string;
  /** git blob SHA-1 */
  sha: string;
  size: number;
}

export interface SkinSyncManifest {
  commit: string;
  files: SkinSyncEntry[];
}

interface SkinSyncRecord {
  sha: string;
  size: number;
  /** 本地文件写入/认领时间 */
  at: string;
}

export interface SkinSyncStateFile {
  version: number;
  targetRoot: string;
  suffix: string;
  commit: string;
  updatedAt: string;
  files: Record<string, SkinSyncRecord>;
}

export interface ProxySetting {
  protocol: string;
  host: string;
  port: number;
  auth?: { username: string; password: string };
}

export interface SkinSyncSettings {
  enabled: boolean;
  proxy: string;
  intervalMin: number;
  missingOnly: boolean;
  skinRoot: string;
  suffix: string;
}

export interface SkinSyncPlanItem {
  entry: SkinSyncEntry;
  target: string;
  reason: 'missing' | 'changed' | 'unknown';
}

export interface SkinSyncPlan {
  items: SkinSyncPlanItem[];
  adopted: SkinSyncEntry[];
  unchanged: number;
  ignored: number;
}

export interface SkinSyncRunResult {
  ok: boolean;
  error?: string;
  /** 清单里可用的皮肤条目数 */
  total: number;
  missing: number;
  changed: number;
  downloaded: number;
  adopted: number;
  failed: number;
  bytes: number;
  commit: string;
  viaProxy: boolean;
  startedAt: string;
  finishedAt: string;
}

// ==================== 配置 / 状态 ====================

const asBool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1') {
      return true;
    }
    if (text === 'false' || text === '0') {
      return false;
    }
  }
  return fallback;
};

const asNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
};

export const readSkinSyncSettings = (): SkinSyncSettings => {
  const config = readJsonConfig(configPath());
  const skinRoot = `${config.SKIN_PATH || ''}`.trim() || path.join(userDataDir(), 'skins');
  return {
    enabled: asBool(config[SKIN_SYNC_KEYS.enabled], true),
    proxy: `${config[SKIN_SYNC_KEYS.proxy] ?? DEFAULT_SKIN_SYNC_PROXY}`.trim(),
    intervalMin: asNumber(config[SKIN_SYNC_KEYS.intervalMin], DEFAULT_INTERVAL_MIN, 1, 24 * 60),
    missingOnly: asBool(config[SKIN_SYNC_KEYS.missingOnly], true),
    skinRoot,
    suffix: `${config.SKIN_DEFAULT_SUFFIX || 'leagueSkins'}`.trim() || 'leagueSkins',
  };
};

const readState = (): SkinSyncStateFile => {
  const raw = readJsonConfig(statePath());
  const files: Record<string, SkinSyncRecord> = {};
  if (raw && typeof raw.files === 'object' && raw.files) {
    for (const [key, value] of Object.entries(raw.files as Record<string, any>)) {
      if (value && typeof value.sha === 'string') {
        files[key] = {
          sha: value.sha,
          size: Number(value.size) || 0,
          at: `${value.at || ''}`,
        };
      }
    }
  }
  return {
    version: STATE_VERSION,
    targetRoot: `${raw.targetRoot || ''}`,
    suffix: `${raw.suffix || ''}`,
    commit: `${raw.commit || ''}`,
    updatedAt: `${raw.updatedAt || ''}`,
    files,
  };
};

const writeState = (state: SkinSyncStateFile): void => {
  try {
    writeJsonConfig(statePath(), state as unknown as Record<string, any>);
  } catch (error) {
    console.warn('[皮肤同步] 保存状态失败:', error);
  }
};

// ==================== 代理 / HTTP ====================

/** 解析代理地址；空字符串返回 null（直连），写错了也返回 null 并让调用方提示 */
export const parseProxyUrl = (raw: string): ProxySetting | null => {
  const text = `${raw ?? ''}`.trim();
  if (!text) {
    return null;
  }
  try {
    const url = new URL(text.includes('://') ? text : `http://${text}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (!url.hostname || !Number.isFinite(port)) {
      return null;
    }
    const auth = url.username
      ? {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
        }
      : undefined;
    return { protocol: url.protocol.replace(':', ''), host: url.hostname, port, auth };
  } catch {
    return null;
  }
};

const createClient = (proxy: ProxySetting | null): AxiosInstance =>
  axios.create({
    timeout: REQUEST_TIMEOUT_MS,
    // null 时传 false：不要读 HTTP_PROXY 等环境变量，代理只由本程序配置决定
    proxy: proxy ?? false,
    maxRedirects: 5,
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
  });

export const parseManifest = (raw: unknown): SkinSyncManifest | null => {
  const data = raw as { commit?: unknown; files?: unknown };
  if (!data || !Array.isArray(data.files)) {
    return null;
  }
  const files: SkinSyncEntry[] = [];
  for (const item of data.files as unknown[]) {
    if (!Array.isArray(item) || item.length < 3) {
      continue;
    }
    const [entryPath, sha, size] = item as [unknown, unknown, unknown];
    if (typeof entryPath !== 'string' || typeof sha !== 'string') {
      continue;
    }
    files.push({ path: entryPath, sha, size: Number(size) || 0 });
  }
  return { commit: `${data.commit ?? ''}`, files };
};

const fetchManifest = async (client: AxiosInstance): Promise<SkinSyncManifest> => {
  // 清单约 1 MB，走代理时实测可能要几十秒，单独放宽超时
  const response = await client.get(manifestUrl(), {
    responseType: 'json',
    timeout: 120_000,
  });
  const manifest = parseManifest(response.data);
  if (!manifest) {
    throw new Error('清单格式不对（没有 files 数组）');
  }
  return manifest;
};

// ==================== 计划 ====================

export const syncTargetPath = (
  skinRoot: string,
  suffix: string,
  entryPath: string
): { target: string; heroId: string; skinIndex: number } | null => {
  const parsed = parseLeagueSkinsEntry(entryPath);
  if (!parsed) {
    return null;
  }
  return {
    target: path.join(skinRoot, suffix, parsed.heroId, `${parsed.heroId}_${parsed.skinIndex}.zip`),
    heroId: parsed.heroId,
    skinIndex: parsed.skinIndex,
  };
};

/**
 * 比较清单与本地状态，算出要下载的、可以认领的、以及不用动的。
 *
 * 认领（adopted）只发生在「本地文件存在、但状态里没有记录」且开关要求先补齐缺失时：
 * 否则第一次同步就得把整库 4 GB 重下一遍。
 */
export const planSync = (
  manifest: SkinSyncManifest,
  state: SkinSyncStateFile,
  skinRoot: string,
  suffix: string,
  options: { missingOnly: boolean; force?: boolean }
): SkinSyncPlan => {
  const plan: SkinSyncPlan = { items: [], adopted: [], unchanged: 0, ignored: 0 };
  for (const entry of manifest.files) {
    const mapped = syncTargetPath(skinRoot, suffix, entry.path);
    if (!mapped) {
      plan.ignored++;
      continue;
    }
    const record = state.files[entry.path];
    const exists = fs.existsSync(mapped.target);

    if (options.force) {
      plan.items.push({ entry, target: mapped.target, reason: exists ? 'changed' : 'missing' });
      continue;
    }
    if (record && record.sha === entry.sha && exists) {
      plan.unchanged++;
      continue;
    }
    if (!exists) {
      plan.items.push({ entry, target: mapped.target, reason: 'missing' });
      continue;
    }
    if (record) {
      plan.items.push({ entry, target: mapped.target, reason: 'changed' });
      continue;
    }
    if (options.missingOnly) {
      plan.adopted.push(entry);
      continue;
    }
    plan.items.push({ entry, target: mapped.target, reason: 'unknown' });
  }
  return plan;
};

// ==================== 下载 ====================

const entryUrl = (entry: SkinSyncEntry): string =>
  `${rawBase()}/${entry.path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;

const downloadEntry = async (
  client: AxiosInstance,
  entry: SkinSyncEntry,
  target: string
): Promise<number> => {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.part`;
  // git 的 blob SHA = sha1("blob <长度>\0" + 内容)，长度先用清单里的
  const hash = createHash('sha1');
  hash.update(`blob ${entry.size}\0`);
  let bytes = 0;
  try {
    const response = await client.get(entryUrl(entry), { responseType: 'stream' });
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(response.data, counter, fs.createWriteStream(temp));
    const digest = hash.digest('hex');
    if (bytes !== entry.size || digest !== entry.sha) {
      throw new Error(`校验失败（${bytes} 字节 / sha1 ${digest}）`);
    }
    await fsp.rename(temp, target);
    return bytes;
  } catch (error) {
    await fsp.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
};

const runPool = async <T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> => {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) {
        return;
      }
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
};

const diskFreeBytes = (dir: string): number | null => {
  try {
    const stats = fs.statfsSync(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
};

// ==================== 运行 ====================

let running = false;
let lastRun: SkinSyncRunResult | null = null;
let timer: NodeJS.Timeout | null = null;
let nextCheckAt = 0;

export const isSkinSyncRunning = (): boolean => running;

const emptyResult = (startedAt: string): SkinSyncRunResult => ({
  ok: false,
  total: 0,
  missing: 0,
  changed: 0,
  downloaded: 0,
  adopted: 0,
  failed: 0,
  bytes: 0,
  commit: '',
  viaProxy: false,
  startedAt,
  finishedAt: startedAt,
});

/**
 * 同步一次（手动或定时都会走这里）。
 *
 * @param force 为 true 时不看本地记录，清单里能识别的皮肤全部重新下载并校验
 */
export const syncSkinsNow = async (force = false): Promise<SkinSyncRunResult> => {
  const startedAt = new Date().toISOString();
  const result = emptyResult(startedAt);
  if (running) {
    return { ...result, error: '正在同步，请稍候' };
  }
  running = true;
  const settings = readSkinSyncSettings();
  const proxy = parseProxyUrl(settings.proxy);
  const client = createClient(proxy);
  result.viaProxy = !!proxy;
  let state = readState();
  try {
    if (!settings.proxy) {
      LogMsgUtil.sendLogMsg('[皮肤同步] 未配置代理，直连 GitHub');
    } else if (!proxy) {
      LogMsgUtil.sendLogMsg(`[皮肤同步] 代理地址无法解析（${settings.proxy}），本次直连`);
    }

    LogMsgUtil.sendLogMsg(
      `[皮肤同步] 检查清单 ${manifestUrl()}${proxy ? `（代理 ${settings.proxy}）` : ''}`
    );
    const manifest = await fetchManifest(client);
    result.commit = manifest.commit;

    const plan = planSync(manifest, state, settings.skinRoot, settings.suffix, {
      missingOnly: settings.missingOnly,
      force,
    });
    result.total = manifest.files.length;
    result.missing = plan.items.filter((item) => item.reason === 'missing').length;
    result.changed = plan.items.filter((item) => item.reason !== 'missing').length;
    result.adopted = plan.adopted.length;

    const bytesNeeded = plan.items.reduce((sum, item) => sum + item.entry.size, 0);
    LogMsgUtil.sendLogMsg(
      `[皮肤同步] 可识别 ${plan.items.length + plan.unchanged + plan.adopted.length} 个皮肤，` +
        `新增 ${result.missing}，变化 ${result.changed}，无需改动 ${plan.unchanged}，` +
        `认领本地已有 ${result.adopted}，待下载 ${(bytesNeeded / 1024 / 1024 / 1024).toFixed(2)} GB`
    );

    if (plan.adopted.length > 0) {
      const at = new Date().toISOString();
      for (const entry of plan.adopted) {
        state.files[entry.path] = { sha: entry.sha, size: entry.size, at };
      }
    }

    if (plan.items.length > 0) {
      const free = diskFreeBytes(settings.skinRoot);
      if (free !== null && bytesNeeded + DISK_RESERVE_BYTES > free) {
        throw new Error(
          `空间不足：需要约 ${(bytesNeeded / 1024 / 1024 / 1024).toFixed(1)} GB，` +
            `只剩 ${(free / 1024 / 1024 / 1024).toFixed(1)} GB`
        );
      }
    }

    const total = plan.items.length;
    let done = 0;
    const errors: string[] = [];
    const startedMs = Date.now();
    await runPool(plan.items, DOWNLOAD_CONCURRENCY, async (item) => {
      try {
        result.bytes += await downloadEntry(client, item.entry, item.target);
        state.files[item.entry.path] = {
          sha: item.entry.sha,
          size: item.entry.size,
          at: new Date().toISOString(),
        };
        result.downloaded++;
      } catch (error) {
        result.failed++;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${item.entry.path}: ${message}`);
        LogMsgUtil.sendLogMsg(`[皮肤同步] 下载失败 ${item.entry.path}: ${message}`);
      }
      done++;
      if (done % 20 === 0 || done === total) {
        const percent = total === 0 ? 100 : Math.round((done / total) * 100);
        const speed =
          result.bytes > 0
            ? `，${((result.bytes / 1024 / 1024 / (Date.now() - startedMs)) * 1000).toFixed(
                1
              )} MB/s`
            : '';
        ProgressMsgUtil.sendProgress(
          percent,
          PROGRESS_KEY,
          '皮肤同步',
          `${done}/${total}，已下载 ${(result.bytes / 1024 / 1024).toFixed(1)} MB${speed}`
        );
        if (done % 100 === 0) {
          LogMsgUtil.sendLogMsg(`[皮肤同步] 进度 ${done}/${total}`);
        }
      }
      if (done % 20 === 0) {
        // 中途也保存，程序被关掉的话下次不用重下已经完成的
        state.commit = manifest.commit;
        state.updatedAt = new Date().toISOString();
        writeState(state);
      }
    });

    state = {
      version: STATE_VERSION,
      targetRoot: settings.skinRoot,
      suffix: settings.suffix,
      commit: manifest.commit,
      updatedAt: new Date().toISOString(),
      files: state.files,
    };
    writeState(state);

    result.ok = result.failed === 0;
    if (!result.ok) {
      result.error = `${result.failed} 个文件下载失败：${errors[0] ?? ''}`;
    }
    LogMsgUtil.sendLogMsg(
      `[皮肤同步] 完成：下载 ${result.downloaded}，认领 ${result.adopted}，失败 ${result.failed}，` +
        `共 ${(result.bytes / 1024 / 1024).toFixed(1)} MB（commit ${manifest.commit.slice(0, 8)}）`
    );
    if (result.downloaded === 0 && result.adopted === 0) {
      LogMsgUtil.sendLogMsg('[皮肤同步] 皮肤已是最新');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.ok = false;
    result.error = message;
    LogMsgUtil.sendLogMsg(`[皮肤同步] 失败：${message}`);
    if (settings.proxy && /ECONN|ETIMEDOUT|ENOTFOUND|proxy|代理/i.test(message)) {
      LogMsgUtil.sendLogMsg(
        `[皮肤同步] 代理连不上（${settings.proxy}）：确认代理已启动，或在设置里改代理/留空直连`
      );
    }
  } finally {
    running = false;
    result.finishedAt = new Date().toISOString();
    lastRun = result;
    try {
      ProgressMsgUtil.close(PROGRESS_KEY);
    } catch {
      // 渲染进程不在也无所谓
    }
  }
  return result;
};

// ==================== 定时器 ====================

const scheduleNext = (delayMs: number): void => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const settings = readSkinSyncSettings();
  if (!settings.enabled) {
    nextCheckAt = 0;
    return;
  }
  nextCheckAt = Date.now() + delayMs;
  timer = setTimeout(async () => {
    timer = null;
    try {
      await syncSkinsNow();
    } catch (error) {
      console.warn('[皮肤同步] 定时同步失败:', error);
    }
    scheduleNext(Math.max(1, readSkinSyncSettings().intervalMin) * 60_000);
  }, delayMs);
  timer.unref?.();
};

/** 启动（或重启）定时检查；设置改动后也调它重新排期 */
export const startSkinSyncMonitor = (): void => {
  const settings = readSkinSyncSettings();
  if (!settings.enabled) {
    stopSkinSyncMonitor();
    LogMsgUtil.sendLogMsg('[皮肤同步] 自动同步未启用');
    return;
  }
  scheduleNext(FIRST_CHECK_DELAY_MS);
  LogMsgUtil.sendLogMsg(
    `[皮肤同步] 已启用：每 ${settings.intervalMin} 分钟检查一次` +
      `（代理 ${settings.proxy || '直连'}，目标 ${path.join(settings.skinRoot, settings.suffix)}）`
  );
};

export const stopSkinSyncMonitor = (): void => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  nextCheckAt = 0;
};

export interface SkinSyncState {
  repo: string;
  running: boolean;
  nextCheckAt: number;
  settings: SkinSyncSettings;
  proxyValid: boolean;
  lastRun: SkinSyncRunResult | null;
  state: { commit: string; updatedAt: string; recorded: number };
}

export const getSkinSyncState = (): SkinSyncState => {
  const settings = readSkinSyncSettings();
  const state = readState();
  return {
    repo: SKIN_SYNC_REPO,
    running,
    nextCheckAt,
    settings,
    proxyValid: !settings.proxy || !!parseProxyUrl(settings.proxy),
    lastRun,
    state: {
      commit: state.commit,
      updatedAt: state.updatedAt,
      recorded: Object.keys(state.files).length,
    },
  };
};

export interface SkinSyncProbeResult {
  ok: boolean;
  /** 这次请求花了多少毫秒 */
  ms: number;
  entries?: number;
  commit?: string;
  viaProxy: boolean;
  error?: string;
}

/** 测试代理（顺便验证清单能读到）：只拉清单，不下载任何皮肤 */
export const testSkinSyncProxy = async (): Promise<SkinSyncProbeResult> => {
  const settings = readSkinSyncSettings();
  const proxy = parseProxyUrl(settings.proxy);
  const started = Date.now();
  try {
    const manifest = await fetchManifest(createClient(proxy));
    return {
      ok: true,
      ms: Date.now() - started,
      entries: manifest.files.length,
      commit: manifest.commit,
      viaProxy: !!proxy,
    };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      viaProxy: !!proxy,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/** 保存界面上的设置并重新排期（不立刻开始同步） */
export const setSkinSyncSettings = (patch: {
  enabled?: boolean;
  proxy?: string;
  intervalMin?: number;
  missingOnly?: boolean;
}): SkinSyncState => {
  const config = readJsonConfig(configPath());
  if (patch.enabled !== undefined) {
    config[SKIN_SYNC_KEYS.enabled] = !!patch.enabled;
  }
  if (patch.proxy !== undefined) {
    config[SKIN_SYNC_KEYS.proxy] = `${patch.proxy}`.trim();
  }
  if (patch.intervalMin !== undefined) {
    config[SKIN_SYNC_KEYS.intervalMin] = asNumber(
      patch.intervalMin,
      DEFAULT_INTERVAL_MIN,
      1,
      24 * 60
    );
  }
  if (patch.missingOnly !== undefined) {
    config[SKIN_SYNC_KEYS.missingOnly] = !!patch.missingOnly;
  }
  writeJsonConfig(configPath(), config);
  startSkinSyncMonitor();
  return getSkinSyncState();
};
