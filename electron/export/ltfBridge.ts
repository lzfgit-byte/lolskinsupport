/**
 * LeagueToolFlop (LTF) 桥客户端 —— 与注入到 LTK Manager 里的 LeagueToolFlop.dll 通信。
 *
 * 注入方式（与 Rose 1.5 一致）：
 *   - ltk_launcher.exe 以隐藏方式启动 LTK Manager，并把 LeagueToolFlop.dll 注入进去；
 *   - DLL 在 LTK Manager 进程里起一个 TCP 服务，监听 127.0.0.1:46321-46340，
 *     通过 LTK Manager 自己的 CDP 页面驱动它的后端（导入/开关模组、启停 patcher）；
 *   - 每行一个 JSON 请求，一个连接一次请求，回一行 JSON。
 *
 * 除 hello / ping 外，每条命令都要带上 DLL 发布的令牌（注册表
 * HKCU\Software\LTKBridge 与 %LOCALAPPDATA%\LTKBridge\token.txt），这样网页里
 * 乱发一行 JSON 是驱动不了 LTK Manager 的。
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFile } from 'node:child_process';

export const PORT_RANGE_START = 46321;
export const PORT_RANGE_END = 46340;
const REG_PATH = 'HKCU\\Software\\LTKBridge';
const REG_PORT = 'ApiPort';
const REG_TOKEN = 'ApiToken';
const PUBLIC_PORT_FILE = 'C:\\Users\\Public\\LTKBridge.port';
const BRIDGE_DIR_NAME = 'LTKBridge';

/** 建立连接的上限；Windows 对已关闭的环回端口会重试约 1 秒 */
const CONNECT_TIMEOUT_MS = 1000;
const PROBE_TIMEOUT_MS = 250;
/** 只碰 DLL 本身的命令回得快；走 CDP 的（toggle / patcher）要慢一些 */
const FAST_TIMEOUT_MS = 5000;
const DEFAULT_TIMEOUT_MS = 60000;
/** LTK Manager 安装一个模组最多给 3 分钟（地图、语音包很大） */
const IMPORT_TIMEOUT_MS = 200000;

export class BridgeUnavailable extends Error {}

export class BridgeCommandError extends Error {}

export interface BridgeHello {
  ok?: boolean;
  service?: string;
  pid?: number;
  [key: string]: unknown;
}

export interface LibraryEntry {
  id?: string;
  name?: string;
  displayName?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/** LTK Manager 前端写出来的错误码，翻译成人能看懂的一句话 */
const LTK_PATCHER_MESSAGES: Record<string, string> = {
  BUSY: '先停止 patcher 再改动模组',
  ALREADY_RUNNING: 'patcher 已经在运行',
  NOT_RUNNING: 'patcher 没有在运行',
  UNSUPPORTED_PLATFORM: '当前平台还没有 patcher',
  LEAGUE_ELEVATED: '英雄联盟被设成了以管理员身份运行，请关掉它再启动 patcher',
  MANAGER_ELEVATED: 'LTK Manager 正以管理员身份运行，请用普通权限重开它',
  DLL_UNAVAILABLE: '没有可用的 patcher DLL',
};

const unauthorized = (response: Record<string, any>): boolean =>
  response?.ok === false && String(response?.error ?? '').startsWith('unauthorized');

const regQueryValue = (name: string): Promise<string | null> =>
  new Promise((resolve) => {
    execFile('reg', ['query', REG_PATH, '/v', name], { windowsHide: true }, (error, stdout) => {
      if (error || !stdout) {
        resolve(null);
        return;
      }
      const line = stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find((item) => item.toLowerCase().startsWith(name.toLowerCase()));
      if (!line) {
        resolve(null);
        return;
      }
      const parts = line.split(/\s+/);
      resolve(parts[parts.length - 1] || null);
    });
  });

const parsePort = (raw: string | null): number | null => {
  if (!raw) {
    return null;
  }
  const text = raw.trim();
  const value = text.toLowerCase().startsWith('0x') ? parseInt(text, 16) : parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** DLL 写端口和令牌的位置：桌面用户的本地应用数据 */
const bridgeDirs = (): string[] => {
  const dirs: string[] = [];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    dirs.push(path.join(localAppData, BRIDGE_DIR_NAME));
  }
  return dirs;
};

const readTextFile = (file: string): string | null => {
  try {
    return fs.readFileSync(file, 'ascii');
  } catch {
    return null;
  }
};

const portFromFile = (file: string): number | null => parsePort(readTextFile(file));

/** 先试这里发布的端口，再扫整个端口段 */
const publishedPorts = async (): Promise<number[]> => {
  const ports: number[] = [];
  const fromRegistry = parsePort(await regQueryValue(REG_PORT));
  if (fromRegistry) {
    ports.push(fromRegistry);
  }
  for (const dir of bridgeDirs()) {
    const found = portFromFile(path.join(dir, 'port.txt'));
    if (found) {
      ports.push(found);
    }
  }
  const publicPort = portFromFile(PUBLIC_PORT_FILE);
  if (publicPort) {
    ports.push(publicPort);
  }
  return [...new Set(ports)];
};

/** 所有能读到的令牌副本：先令牌文件，再注册表（可能有一份是旧的） */
export const tokenCandidates = async (): Promise<{ where: string; token: string }[]> => {
  const found: { where: string; token: string }[] = [];
  const add = (where: string, token: string | null) => {
    const value = (token || '').trim();
    if (value && !found.some((item) => item.token === value)) {
      found.push({ where, token: value });
    }
  };
  for (const dir of bridgeDirs()) {
    add(path.join(dir, 'token.txt'), readTextFile(path.join(dir, 'token.txt')));
  }
  add(`${REG_PATH}（注册表）`, await regQueryValue(REG_TOKEN));
  return found;
};

export const readToken = async (): Promise<string | null> => {
  const found = await tokenCandidates();
  return found[0]?.token ?? null;
};

const probe = (port: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<BridgeHello | null> =>
  new Promise((resolve) => {
    let buffer = '';
    let settled = false;
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (value: BridgeHello | null) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(null));
    socket.on('connect', () => socket.write('{"cmd":"hello"}\n'));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      const index = buffer.indexOf('\n');
      if (index < 0) {
        return;
      }
      try {
        const response = JSON.parse(buffer.slice(0, index));
        finish(response?.ok === true && response?.service === 'LTKBridge' ? response : null);
      } catch {
        finish(null);
      }
    });
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));
  });

/** 端口是否接受连接：一次全部并发，否则扫一遍端口段要好几秒 */
const listeningPorts = (ports: number[], timeoutMs = PROBE_TIMEOUT_MS): Promise<number[]> =>
  Promise.all(
    ports.map(
      (port) =>
        new Promise<number | null>((resolve) => {
          const socket = net.connect({ host: '127.0.0.1', port });
          const done = (ok: boolean) => {
            socket.destroy();
            resolve(ok ? port : null);
          };
          socket.setTimeout(timeoutMs, () => done(false));
          socket.once('connect', () => done(true));
          socket.once('error', () => done(false));
        })
    )
  ).then((values) =>
    values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  );

/**
 * 找到桥：先试已发布的端口，再扫端口段。
 *
 * 给了 expectedPid 时只认那个 LTK Manager 进程里的桥（旧的、别的程序的都不算）。
 */
export const findBridge = async (
  expectedPid?: number
): Promise<{ port: number; hello: BridgeHello } | null> => {
  const seen = new Set<number>();

  const accept = async (port: number | null) => {
    if (!port || seen.has(port)) {
      return null;
    }
    seen.add(port);
    const hello = await probe(port);
    if (!hello) {
      return null;
    }
    if (expectedPid !== undefined && hello.pid !== expectedPid) {
      return null;
    }
    return { port, hello };
  };

  for (const port of await publishedPorts()) {
    const found = await accept(port);
    if (found) {
      return found;
    }
  }

  const candidates: number[] = [];
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!seen.has(port)) {
      candidates.push(port);
    }
  }
  for (const port of await listeningPorts(candidates)) {
    const found = await accept(port);
    if (found) {
      return found;
    }
  }
  return null;
};

const ltkErrorText = (error: Record<string, any>): string => {
  const code = String(error.code);
  const inner = error.error;
  if (inner && typeof inner === 'object' && inner.kind) {
    let kind = String(inner.kind);
    let text = LTK_PATCHER_MESSAGES[kind] || String(inner.message || '');
    if (inner.reason) {
      text = `${text}: ${
        typeof inner.reason === 'string' ? inner.reason : JSON.stringify(inner.reason)
      }`;
    }
    if (inner.stage) {
      kind = `${kind} (${inner.stage})`;
    }
    return text ? `${code} ${kind}: ${text}` : `${code} ${kind}`;
  }
  const detail = error.message || error.detail;
  if (detail) {
    return `${code}: ${detail}`;
  }
  const rest = { ...error };
  delete rest.code;
  return Object.keys(rest).length ? `${code} ${JSON.stringify(rest).slice(0, 200)}` : code;
};

/** 命令失败的原因：DLL 或 LTK Manager 放在哪就从哪取 */
const errorText = (response: Record<string, any>): string => {
  const nested = response?.response;
  for (let candidate of [
    response?.error,
    nested && typeof nested === 'object' ? nested.error : null,
  ]) {
    if (candidate && typeof candidate === 'object') {
      candidate = candidate.code
        ? ltkErrorText(candidate)
        : candidate.message || JSON.stringify(candidate);
    }
    if (candidate) {
      return String(candidate);
    }
  }
  return JSON.stringify(response).slice(0, 300);
};

/** 一次会话的桥连接（每个命令各开一条连接，不保持长连接） */
export class LtkBridge {
  private portValue: number | null;
  public pid: number | null;
  private token: string | null = null;

  constructor(port: number | null = null, pid: number | null = null) {
    this.portValue = port;
    this.pid = pid;
  }

  get port(): number {
    if (this.portValue === null) {
      throw new BridgeUnavailable('还没有连上 LTKBridge');
    }
    return this.portValue;
  }

  /** 连上（或重新连上）桥，返回端口；失败抛 BridgeUnavailable */
  async connect(): Promise<number> {
    if (this.portValue !== null) {
      return this.portValue;
    }
    const found = await findBridge(this.pid ?? undefined);
    if (!found) {
      throw new BridgeUnavailable('找不到 LTKBridge 服务');
    }
    this.portValue = found.port;
    this.pid = (found.hello.pid as number) ?? this.pid;
    return this.portValue;
  }

  private send(payload: Record<string, unknown>, timeoutMs: number): Promise<Record<string, any>> {
    const port = this.port;
    return new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const socket = net.connect({ host: '127.0.0.1', port });
      const finish = (error: Error | null, value?: Record<string, any>) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        if (error) {
          reject(error);
        } else {
          resolve(value as Record<string, any>);
        }
      };
      socket.setTimeout(CONNECT_TIMEOUT_MS, () =>
        finish(new BridgeUnavailable(`LTKBridge 端口 ${port} 连不上`))
      );
      socket.on('connect', () => {
        socket.setTimeout(timeoutMs, () =>
          finish(new BridgeUnavailable(`LTKBridge 在 ${Math.round(timeoutMs / 1000)} 秒内没有回应`))
        );
        // 命令一旦发出去就不再重发：import / toggle 重发会做两遍
        socket.write(`${JSON.stringify(payload)}\n`);
      });
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf-8');
        const index = buffer.indexOf('\n');
        if (index < 0) {
          return;
        }
        try {
          finish(null, JSON.parse(buffer.slice(0, index)));
        } catch (error) {
          finish(new BridgeUnavailable(`LTKBridge 回了无法解析的内容: ${String(error)}`));
        }
      });
      socket.on('error', (error) =>
        finish(new BridgeUnavailable(`LTKBridge 请求失败: ${error.message}`))
      );
      socket.on('close', () => {
        if (!settled) {
          finish(new BridgeUnavailable('LTKBridge 关闭了连接'));
        }
      });
    });
  }

  /** 发一条命令并返回它的 JSON 应答 */
  async request(
    payload: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<Record<string, any>> {
    await this.connect();
    if (payload.cmd === 'hello' || payload.cmd === 'ping') {
      return this.send(payload, timeoutMs);
    }
    if (this.token === null) {
      this.token = await readToken();
    }
    let response = await this.send({ ...payload, token: this.token ?? '' }, timeoutMs);
    if (!unauthorized(response)) {
      return response;
    }
    // 桥重启换了令牌，或者先读到的那份是旧的：把已知的令牌都试一遍
    const tried = new Set([this.token]);
    const candidates = await tokenCandidates();
    for (const { where, token } of candidates) {
      if (!token || tried.has(token)) {
        continue;
      }
      tried.add(token);
      response = await this.send({ ...payload, token }, timeoutMs);
      if (!unauthorized(response)) {
        console.info(`[LTF] 桥接受了 ${where} 里的令牌`);
        this.token = token;
        return response;
      }
    }
    console.warn(`[LTF] 桥拒绝了所有已发布的令牌（试了 ${tried.size} 个）`);
    return response;
  }

  private async ok(
    payload: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<Record<string, any>> {
    const response = await this.request(payload, timeoutMs);
    if (response?.ok === false) {
      throw new BridgeCommandError(`${payload.cmd} 失败: ${errorText(response)}`);
    }
    return response;
  }

  // ---- 会话 -----------------------------------------------------------
  hello(): Promise<Record<string, any>> {
    return this.request({ cmd: 'hello' }, FAST_TIMEOUT_MS);
  }

  ping(): Promise<Record<string, any>> {
    return this.request({ cmd: 'ping' }, FAST_TIMEOUT_MS);
  }

  status(): Promise<Record<string, any>> {
    return this.request({ cmd: 'status' }, FAST_TIMEOUT_MS);
  }

  async alive(): Promise<boolean> {
    try {
      return (await this.ping()).ok === true;
    } catch {
      return false;
    }
  }

  // ---- 模组库 ---------------------------------------------------------
  listMods(): Promise<Record<string, any>> {
    return this.request({ cmd: 'list' }, DEFAULT_TIMEOUT_MS);
  }

  /** LTK Manager 库里的模组；读不到时抛错（空列表会被当成「什么都没装」） */
  async library(): Promise<LibraryEntry[]> {
    const response = await this.listMods();
    const library = response?.library;
    if (response?.ok === false || !Array.isArray(library)) {
      throw new BridgeCommandError(`list 失败: ${errorText(response)}`);
    }
    return library as LibraryEntry[];
  }

  /** 把 *file* 这个压缩包原样装进 LTK Manager 的库 */
  importArchive(file: string, name?: string): Promise<Record<string, any>> {
    const payload: Record<string, unknown> = { cmd: 'import', path: file };
    if (name) {
      payload.name = name;
    }
    return this.ok(payload, IMPORT_TIMEOUT_MS);
  }

  /** LTK Manager 读不到那个路径时，把压缩包内容直接发过去 */
  importBytes(data: Buffer, name: string): Promise<Record<string, any>> {
    return this.ok({ cmd: 'import', data_b64: data.toString('base64'), name }, IMPORT_TIMEOUT_MS);
  }

  toggle(
    target: string,
    enabled = true,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<Record<string, any>> {
    return this.ok({ cmd: 'toggle', target, enabled }, timeoutMs);
  }

  uninstall(target: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Record<string, any>> {
    return this.ok({ cmd: 'uninstall', target }, timeoutMs);
  }

  // ---- 设置 -----------------------------------------------------------
  /** 关掉 LTK Manager 的「自动检查模组」：每局都装一遍皮肤的话，开着它等于每局都查 */
  healthCheckOff(): Promise<Record<string, any>> {
    return this.ok({ cmd: 'health_check_off' });
  }

  // ---- patcher --------------------------------------------------------
  startPatcher(): Promise<Record<string, any>> {
    return this.ok({ cmd: 'start_patcher' });
  }

  stopPatcher(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Record<string, any>> {
    return this.ok({ cmd: 'stop_patcher' }, timeoutMs);
  }

  patcherStatus(): Promise<Record<string, any>> {
    return this.request({ cmd: 'patcher_status' }, DEFAULT_TIMEOUT_MS);
  }

  /** 让 LTK Manager 退出（应答可能永远不到） */
  async kill(): Promise<Record<string, any>> {
    try {
      return await this.request({ cmd: 'kill' }, FAST_TIMEOUT_MS);
    } catch {
      return { ok: true, note: '连接已断开 —— LTK Manager 正在退出' };
    }
  }

  /** 等桥起来（DLL 注入要一点时间） */
  static async waitForBridge(
    timeoutMs = 30000,
    expectedPid?: number,
    cancelled?: () => boolean
  ): Promise<LtkBridge> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = await findBridge(expectedPid);
      if (found) {
        return new LtkBridge(found.port, (found.hello.pid as number) ?? null);
      }
      if (cancelled?.()) {
        throw new BridgeUnavailable('等待 LTKBridge 被取消');
      }
      if (Date.now() >= deadline) {
        throw new BridgeUnavailable(
          `LTKBridge 在 ${Math.round(
            timeoutMs / 1000
          )} 秒内没有起来（桥 DLL 跑在 ltk-manager.exe 里）`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
