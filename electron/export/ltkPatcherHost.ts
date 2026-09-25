/**
 * LTK patcher host —— 直接驱动 ltk_patcher_host.exe 来挂载 overlay。
 *
 * 背景：以前用 `mod-tools.exe runoverlay` 把 mkoverlay 生成的 overlay 挂进游戏，
 * 新版游戏已经不吃这一套。LTK Manager 改成了「常驻宿主 + hook DLL」：
 *   - ltk_patcher_host.exe 常驻，扫描游戏进程，把 prefix 目录里的 overlay 注入进去
 *   - ltk_patcher_dll.dll 被注入游戏，按 prefix 目录里的 WAD 覆盖资源
 *
 * host 走行协议（参考 ltk-manager 的 patcher/host/protocol.rs）：
 *   stdin : config loglevel <n>
 *           config flags <n>
 *           config prefix <overlay 目录，末尾带分隔符>
 *           start scan
 *           stop
 *   stdout: status <ts> <state> <msg>
 *           error <ts> <msg>
 *           dll <...>                      DLL 透传的日志
 *
 * 两个二进制由用户自备（从 LTK Manager 安装目录里拿），放在 mod-tools.exe 同级。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

// ==================== 常量 ====================

export const LTK_PATCHER_HOST = 'ltk_patcher_host.exe';
export const LTK_PATCHER_DLL = 'ltk_patcher_dll.dll';

/**
 * 4 = CSLOL_HOOK_OPT_OUT_AH_V1：关掉 DLL 的基础皮肤校验。
 *
 * 皮肤落在游戏自带槽位上时，该校验会把整个 overlay 判定成冲突并直接禁用；
 * 打开这个标志后只降级成一条警告（等价于 LTK Manager 里关掉
 * "enforce skinhack scan"）。
 */
export const LTK_PATCHER_FLAGS = 4;

/** 0x10 = Info */
export const LTK_PATCHER_LOG_LEVEL = 0x10;

/** 发送 stop 后等这么久还没退出就强杀 */
export const LTK_PATCHER_STOP_GRACE_MS = 3000;

/** 等 host 确认 config / start scan 的时间上限 */
export const LTK_PATCHER_READY_TIMEOUT_MS = 5000;

/** DLL 在游戏版本比它内置的 EOL 日期新时会打印这句 */
const END_OF_LIFE_MESSAGE = 'end of life reached';
/** 游戏在 host 开始扫描之前就启动了，DLL 挂不上，overlay 不会生效 */
const LATE_JOIN_MESSAGE = 'joined too late';
/** 形如 "overlay verification failed, disabling overlay"，这是唯一会真正禁用 overlay 的 DLL 错误 */
const DISABLE_OVERLAY_MARKER = 'disabling overlay';
/**
 * DLL 日志里错误级别的前缀。
 *
 * Rust 的 log 默认格式是 `2024-01-01T12:00:00Z ERROR module: msg`，所以匹配两边带空格的
 * ` ERROR `；同时也兼容 `[ERROR]` 这种写法。
 */
const DLL_ERROR_PREFIX = /\sERROR\s|\[ERROR\]/;

/** 从 DLL 里反向找出 EOL 时间戳用的特征串 */
const EOL_MARKER = Buffer.from('end of life reached, please update: ', 'latin1');
/** 在加载特征串的代码之前多远范围内找比较指令 */
const EOL_SEARCH_WINDOW = 0x100;

// ==================== 路径 / 校验 ====================

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface LtkPatcherPaths {
  /** ltk_patcher_host.exe 完整路径 */
  host: string;
  /** ltk_patcher_dll.dll 完整路径 */
  dll: string;
}

/**
 * 解析 host / dll 位置：与 mod-tools.exe 同级（用户自备的文件放这里）。
 */
export const resolveLtkPatcherPaths = (modToolsPath: string): LtkPatcherPaths => {
  const dir = path.dirname(modToolsPath);
  return {
    host: path.join(dir, LTK_PATCHER_HOST),
    dll: path.join(dir, LTK_PATCHER_DLL),
  };
};

export interface LtkPatcherStatus extends LtkPatcherPaths {
  /** 缺失的文件名 */
  missing: string[];
  /** DLL 里编译进去的 EOL 时间戳（秒），读不出来为 null */
  eol: number | null;
  /** 当前时间是否已经超过 EOL */
  expired: boolean;
}

/**
 * 检查两个文件是否齐全，并读出 DLL 的 EOL 日期。
 *
 * DLL 会拒绝比它内置 EOL 日期更新的游戏版本，先读出来可以提前失败，
 * 而不是等注入时才发现「什么都没挂上」。
 */
export const checkLtkPatcher = (modToolsPath: string): LtkPatcherStatus => {
  const { host, dll } = resolveLtkPatcherPaths(modToolsPath);
  const missing: string[] = [];
  if (!fs.existsSync(host)) {
    missing.push(LTK_PATCHER_HOST);
  }
  if (!fs.existsSync(dll)) {
    missing.push(LTK_PATCHER_DLL);
  }
  const eol = missing.includes(LTK_PATCHER_DLL) ? null : readDllEol(dll);
  return {
    host,
    dll,
    missing,
    eol,
    expired: eol !== null && Date.now() / 1000 > eol,
  };
};

interface PeSection {
  name: string;
  rva: number;
  rawSize: number;
  rawOffset: number;
}

/** 解析 PE 文件的节表 */
const parseSections = (data: Buffer): PeSection[] => {
  if (data.length < 0x40 || data[0] !== 0x4d || data[1] !== 0x5a) {
    throw new Error('not a PE file');
  }
  const pe = data.readUInt32LE(0x3c);
  if (data.toString('latin1', pe, pe + 4) !== 'PE\u0000\u0000') {
    throw new Error('not a PE file');
  }
  const count = data.readUInt16LE(pe + 6);
  const optSize = data.readUInt16LE(pe + 20);
  const table = pe + 24 + optSize;
  const sections: PeSection[] = [];
  for (let i = 0; i < count; i++) {
    const entry = table + i * 40;
    sections.push({
      name: data.toString('latin1', entry, entry + 8).replace(/\u0000+$/, ''),
      rva: data.readUInt32LE(entry + 12),
      rawSize: data.readUInt32LE(entry + 16),
      rawOffset: data.readUInt32LE(entry + 20),
    });
  }
  return sections;
};

const offsetToRva = (sections: PeSection[], offset: number): number | null => {
  for (const s of sections) {
    if (offset >= s.rawOffset && offset < s.rawOffset + s.rawSize) {
      return offset - s.rawOffset + s.rva;
    }
  }
  return null;
};

/**
 * 在 `lea_index` 之前最近的 `cmp eax, imm32; jbe rel32` 里取出那个常量。
 */
const findEolCompare = (code: Buffer, leaIndex: number): number | null => {
  const start = Math.max(0, leaIndex - EOL_SEARCH_WINDOW);
  for (let j = leaIndex - 11; j >= start; j--) {
    if (code[j] === 0x3d && code[j + 5] === 0x0f && code[j + 6] === 0x86) {
      return code.readUInt32LE(j + 1);
    }
  }
  return null;
};

/**
 * 读出 LTK patcher DLL 里编译进去的 EOL 时间戳。
 *
 * DLL 在引用 "end of life reached" 这句日志之前，会拿游戏 PE 的构建时间戳跟一个
 * 常量比较。这里先定位那句日志，找到加载它的代码，再往前读最近的比较常量。
 */
export const readDllEol = (dllPath: string): number | null => {
  let data: Buffer;
  let sections: PeSection[];
  try {
    data = fs.readFileSync(dllPath);
    sections = parseSections(data);
  } catch {
    return null;
  }

  const msgOffset = data.indexOf(EOL_MARKER);
  if (msgOffset < 0) {
    return null;
  }
  const msgRva = offsetToRva(sections, msgOffset);
  const text = sections.find((s) => s.name === '.text');
  if (msgRva === null || !text) {
    return null;
  }

  const code = data.subarray(text.rawOffset, text.rawOffset + text.rawSize);
  for (let i = 0; i + 7 < code.length; i++) {
    // lea r64, [rip + disp32]
    if (
      (code[i] !== 0x48 && code[i] !== 0x4c) ||
      code[i + 1] !== 0x8d ||
      (code[i + 2] & 0xc7) !== 0x05
    ) {
      continue;
    }
    const disp = code.readInt32LE(i + 3);
    // 新版 Rust 的格式化模板会在字符串前面带长度前缀，所以允许一点点偏差
    const target = text.rva + i + 7 + disp;
    const delta = msgRva - target;
    if (delta < 0 || delta > 16) {
      continue;
    }
    const eol = findEolCompare(code, i);
    if (eol !== null) {
      return eol;
    }
  }
  return null;
};

// ==================== 行协议解析 ====================

/** 等价于 Python 的 `line.split(' ', maxsplit)`，返回最多 maxsplit+1 段 */
const splitLimit = (line: string, maxsplit: number): string[] => {
  const parts: string[] = [];
  let rest = line;
  while (parts.length < maxsplit) {
    const i = rest.indexOf(' ');
    if (i < 0) {
      break;
    }
    parts.push(rest.slice(0, i));
    rest = rest.slice(i + 1);
  }
  parts.push(rest);
  return parts;
};

/** 从 DLL 日志行里剥掉时间戳 / 级别前缀，只留下消息本身 */
const extractDllMessage = (line: string): string => {
  const parts = line.split(DLL_ERROR_PREFIX);
  const message = (parts.length > 1 ? parts[1] : line).trim();
  return message || line;
};

export interface LtkPatcherCallbacks {
  /** 每一行原始输出（不含换行），可直接丢到日志面板 */
  onLog?: (line: string) => void;
  /** 致命错误：host 退出 / 注入失败 / overlay 被禁用 */
  onError?: (message: string) => void;
  /** status 事件里的 state */
  onStatus?: (state: string, message: string) => void;
}

type SessionState = 'idle' | 'scanning' | 'serving' | 'failed';

/**
 * 一个 LTK patcher host 会话。
 *
 * host 是常驻的：只要进程活着，游戏退出后它会回到扫描状态，所以「这次游戏结束了」
 * 不等于「会话结束」，调用方自己决定什么时候 stop。
 */
export class LtkPatcherSession {
  private proc: ChildProcess | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private starting = false;
  /** 调用方主动要求停止，退出事件就不算异常 */
  private stopping = false;
  /** start() 等待 host 首次回报时的唤醒函数 */
  private settleReady: (() => void) | null = null;

  /** 最近一次 status 的 state，例如 scanning / injected / exited / failed */
  public state: string | null = null;
  /** 首个致命错误，用于最终判定 */
  public error: string | null = null;
  /** DLL 是否因为 EOL 拒绝了这个游戏版本 */
  public eolReached = false;
  /** 游戏是否在扫描开始前就启动了 */
  public lateJoin = false;
  private summary: SessionState = 'idle';

  constructor(private readonly callbacks: LtkPatcherCallbacks = {}) {}

  /** 进程还活着 */
  get running(): boolean {
    return this.proc !== null && this.proc.exitCode === null && !this.proc.killed;
  }

  /** 会话是否还在正常工作（未失败、未结束） */
  get active(): boolean {
    return this.summary === 'scanning' || this.summary === 'serving';
  }

  /**
   * 启动 host 并开始扫描。
   *
   * `overlayDir` 是 mkoverlay 的输出目录，会通过 `config prefix` 告诉 DLL，
   * 因此必须先把 host 挂起来再生成 overlay —— DLL 只对「扫描开始之后启动」的
   * 游戏生效。
   *
   * 注意：host 会校验 `config prefix` 的路径**必须已存在**（否则回
   * `error ... prefix path does not exist`），所以目录要先建好。
   *
   * 返回 false 表示 host 已经明确拒绝（比如 prefix 不存在、无法启动），
   * 调用方不要再去跑 mkoverlay 了。
   */
  async start(hostPath: string, overlayDir: string): Promise<boolean> {
    if (this.running || this.starting) {
      return true;
    }
    this.starting = true;
    this.stopping = false;
    this.error = null;
    this.eolReached = false;
    this.lateJoin = false;
    this.state = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    let proc: ChildProcess;
    try {
      proc = spawn(hostPath, [], {
        cwd: path.dirname(hostPath),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (e) {
      this.starting = false;
      this.fail(`无法启动 LTK patcher: ${errText(e)}`);
      return false;
    }

    this.proc = proc;
    // host 可能先于写入就退出，此时往 stdin 写会触发 EPIPE；不吞掉会变成
    // 未捕获异常，直接把整个应用带崩
    proc.stdin?.on('error', () => {});
    proc.stdout?.on('data', (chunk: Buffer) => this.consume('stdout', chunk));
    proc.stderr?.on('data', (chunk: Buffer) => this.consume('stderr', chunk));
    proc.on('error', (err) => {
      this.fail(errText(err));
    });
    proc.on('exit', (code, signal) => {
      this.proc = null;
      this.flush('stdout');
      this.flush('stderr');
      if (this.stopping) {
        return;
      }
      const reason = signal ? `被信号 ${signal} 终止` : `退出码 ${code}`;
      // 还在启动阶段就退了：明确算失败，别让 start() 干等到超时
      this.fail(
        this.summary === 'idle'
          ? `LTK patcher 启动后立刻退出（${reason}）`
          : `LTK patcher 意外退出（${reason}）`
      );
    });

    // host 回复 ok / error / status 时唤醒下面的等待
    const ready = new Promise<void>((resolve) => {
      this.settleReady = resolve;
    });

    // 启动失败（比如文件损坏）是异步报的，等 spawn 事件才能确定真的起来了
    const spawned = await new Promise<boolean>((resolve) => {
      proc.once('spawn', () => resolve(true));
      proc.once('error', () => resolve(false));
    });
    this.starting = false;
    if (!spawned) {
      this.settleReady = null;
      return false;
    }

    const prefix = overlayDir.endsWith(path.sep) ? overlayDir : overlayDir + path.sep;
    if (
      !this.writeAll([
        `config loglevel ${LTK_PATCHER_LOG_LEVEL}`,
        `config flags ${LTK_PATCHER_FLAGS}`,
        `config prefix ${prefix}`,
        'start scan',
      ])
    ) {
      await this.stop();
      return false;
    }

    // 等 host 确认：config 会依次回 `ok ... set`，然后发 `status ... scanning`。
    // prefix 不存在之类的问题会以 `error ...` / `status ... failed` 提前报出来，
    // 在这里就返回失败，免得再去白跑一遍 mkoverlay。
    await Promise.race([
      ready,
      new Promise<void>((resolve) => {
        setTimeout(resolve, LTK_PATCHER_READY_TIMEOUT_MS);
      }),
    ]);

    if (this.error) {
      await this.stop();
      return false;
    }
    this.summary = 'scanning';
    return true;
  }

  /** 优雅停止：先发 stop，宽限期内没退出再强杀 */
  async stop(graceMs = LTK_PATCHER_STOP_GRACE_MS): Promise<void> {
    const proc = this.proc;
    this.stopping = true;
    this.summary = this.summary === 'failed' ? 'failed' : 'idle';
    if (!proc) {
      return;
    }
    this.proc = null;

    const exited = new Promise<void>((resolve) => {
      proc.once('exit', () => resolve());
      if (proc.exitCode !== null) {
        resolve();
      }
    });

    try {
      proc.stdin?.write('stop\n');
      proc.stdin?.end();
    } catch {
      // stdin 可能已经关了，忽略
    }

    await Promise.race([
      exited,
      new Promise<void>((resolve) => {
        setTimeout(() => {
          try {
            proc.kill();
          } catch {
            // 进程可能已经没了
          }
          resolve();
        }, graceMs);
      }),
    ]);
  }

  // ---------- 内部 ----------

  private writeAll(lines: string[]): boolean {
    try {
      for (const line of lines) {
        this.proc?.stdin?.write(`${line}\n`);
      }
      return true;
    } catch (e) {
      this.fail(`无法向 LTK patcher 发送命令: ${errText(e)}`);
      return false;
    }
  }

  private consume(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const key = stream === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer';
    this[key] += chunk.toString('utf-8');
    const lines = this[key].split(/\r?\n/);
    this[key] = lines.pop() ?? '';
    for (const line of lines) {
      this.handleLine(line);
    }
  }

  private flush(stream: 'stdout' | 'stderr'): void {
    const key = stream === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer';
    const rest = this[key];
    this[key] = '';
    if (rest) {
      this.handleLine(rest);
    }
  }

  private handleLine(rawLine: string): void {
    const line = rawLine.trim();
    if (!line) {
      return;
    }
    this.callbacks.onLog?.(line);

    const parts = splitLimit(line, 3);
    if (parts[0] === 'status' && parts.length >= 3) {
      const state = parts[2];
      const message = parts[3] ?? '';
      this.state = state;
      if (state === 'failed') {
        this.fail(message || '注入失败');
      } else {
        // host 的 state 是「模式」，比如 injecting / injected / waiting / exited
        this.summary = 'serving';
        this.settle();
      }
      this.callbacks.onStatus?.(state, message);
      return;
    }

    if (parts[0] === 'error') {
      this.fail(line);
      return;
    }

    if (parts[0] === 'dll') {
      if (line.includes(END_OF_LIFE_MESSAGE)) {
        this.eolReached = true;
        this.fail('ltk_patcher_dll.dll 已经不支持当前游戏版本（已过 EOL 日期）');
      } else if (line.includes(LATE_JOIN_MESSAGE)) {
        this.lateJoin = true;
        this.fail('游戏在 LTK patcher 开始扫描之前就启动了，overlay 没有生效，请重开游戏');
      } else if (line.includes(DISABLE_OVERLAY_MARKER)) {
        // 例如 "overlay verification failed, disabling overlay"
        this.fail(extractDllMessage(line));
      }
    }
  }

  /** 唤醒 start() 里等待首次回报的 Promise */
  private settle(): void {
    const resolve = this.settleReady;
    this.settleReady = null;
    resolve?.();
  }

  /** 只记录第一个错误，后续错误继续写日志但不再覆盖 */
  private fail(message: string): void {
    this.summary = 'failed';
    if (this.error) {
      return;
    }
    this.error = message;
    this.callbacks.onError?.(message);
    this.settle();
  }
}
