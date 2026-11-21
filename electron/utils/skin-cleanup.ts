/**
 * 「一键清理所有皮肤」的纯函数实现：校验目录名 → 统计 → 删除。
 *
 * 删的是 `<皮肤存储路径>/<皮肤目录名称>` 整个目录（导入/同步/构建出来的全部皮肤包），
 * 属于不可恢复操作。主进程只负责弹确认框（`electron/export/index.ts` 的
 * `clearAllSkins`），真正动文件的部分放在这里，方便测试完全跑在临时目录里
 * （`npm run cleanup:test`）。
 */
import fsp from 'node:fs/promises';
import Path from 'node:path';
import { isUnderDir } from './skin-archive';

/** Windows 保留名（CON、NUL、COM1…），不能当文件夹名 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
/** Windows 文件名里不允许出现的字符 */
const INVALID_NAME_CHARS = /[<>:"/\\|?*]/;

export interface SkinOutputInspection {
  /** 目录名合法且能读取（不代表目录一定存在） */
  ok: boolean;
  /** ok=false 时的原因 */
  error?: string;
  /** 会删除的目录（绝对路径；名字不合法时为空） */
  dir: string;
  /** 去掉首尾空格后的目录名 */
  suffix: string;
  exists: boolean;
  files: number;
  bytes: number;
  /** 第一层的英雄目录个数 */
  heroes: number;
  /** 目录里的 .zip 个数 */
  zips: number;
}

export interface ClearSkinOutputResult extends SkinOutputInspection {
  /** 是否真的删掉了目录（目录本来就不存在时也是 false） */
  removed: boolean;
}

export interface ResolvedSkinOutputDir {
  ok: boolean;
  /** ok=false 时的原因 */
  error?: string;
  /** 会删除的绝对路径；名字不合法时为空 */
  dir: string;
  /** 去掉首尾空格后的目录名 */
  suffix: string;
}

/**
 * 把「皮肤目录名称」解析成一个**严格位于皮肤存储路径下**的绝对路径。
 *
 * 目录名是用户手输的（也可能来自被改坏的 config.json），所以这里把它当不可信输入：
 * 只允许单个文件夹名，拒绝路径分隔符、盘符、`..`、保留名和结尾的点/空格，
 * 解析后再用 `isUnderDir()` 兜一层，避免拼出 `..\..\Windows` 这类路径。
 */
export const resolveSkinOutputDir = (skinRoot: string, suffix: string): ResolvedSkinOutputDir => {
  const name = `${suffix ?? ''}`.trim();
  const root = `${skinRoot ?? ''}`.trim();
  const invalid = (error: string): ResolvedSkinOutputDir => ({
    ok: false,
    error,
    dir: '',
    suffix: name,
  });
  if (!root) {
    return invalid('皮肤存储路径为空，无法清理');
  }
  if (!name) {
    return invalid('皮肤目录名称不能为空');
  }
  if (name === '.' || name === '..') {
    return invalid('皮肤目录名称不能是 . 或 ..');
  }
  if (/[\\/]/.test(name)) {
    return invalid('皮肤目录名称只能是单个文件夹名，不能包含路径分隔符');
  }
  if (INVALID_NAME_CHARS.test(name)) {
    return invalid('皮肤目录名称含有 Windows 不允许的字符（< > : " | ? *）');
  }
  // 控制字符不能出现在文件夹名里；单独判断，避免正则里的 \x00-\x1f 触发 lint
  if ([...name].some((char) => char.charCodeAt(0) < 0x20)) {
    return invalid('皮肤目录名称不能包含控制字符');
  }
  if (/[. ]$/.test(name)) {
    return invalid('皮肤目录名称不能以空格或点结尾');
  }
  if (WINDOWS_RESERVED.test(name)) {
    return invalid('皮肤目录名称不能使用 Windows 保留名（CON、PRN、AUX、NUL、COM1…）');
  }
  const resolvedRoot = Path.resolve(root);
  const dir = Path.resolve(resolvedRoot, name);
  if (!isUnderDir(dir, resolvedRoot)) {
    return invalid('清理目标不在皮肤存储路径下，已拒绝');
  }
  return { ok: true, dir, suffix: name };
};

interface MeasuredSkinOutput {
  files: number;
  bytes: number;
  heroes: number;
  zips: number;
}

/**
 * 递归统计（不跟符号链接；链接本身按 1 个文件计，但不计入大小）。
 *
 * 只用于确认框里给用户看「要删多少」，所以单个文件 stat 失败就跳过，不中断统计。
 */
const measureSkinOutput = async (dir: string): Promise<MeasuredSkinOutput> => {
  const totals: MeasuredSkinOutput = { files: 0, bytes: 0, heroes: 0, zips: 0 };
  let top;
  try {
    top = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return totals;
  }
  const stack: string[] = [];
  for (const entry of top) {
    const full = Path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      totals.files++;
      continue;
    }
    if (entry.isDirectory()) {
      totals.heroes++;
      stack.push(full);
      continue;
    }
    if (entry.isFile()) {
      totals.files++;
      if (/\.zip$/i.test(entry.name)) {
        totals.zips++;
      }
      try {
        totals.bytes += (await fsp.stat(full)).size;
      } catch {
        // 统计不到大小不影响删除
      }
    }
  }
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = Path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        totals.files++;
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile()) {
        totals.files++;
        if (/\.zip$/i.test(entry.name)) {
          totals.zips++;
        }
        try {
          totals.bytes += (await fsp.stat(full)).size;
        } catch {
          // 同上
        }
      }
    }
  }
  return totals;
};

const emptyInspection = (suffix: string): SkinOutputInspection => ({
  ok: true,
  dir: '',
  suffix,
  exists: false,
  files: 0,
  bytes: 0,
  heroes: 0,
  zips: 0,
});

/**
 * 清理前的预览：目录名是否合法、目录在不在、有多少文件 / 多大。
 * 不写任何东西，确认框用它展示影响范围。
 */
export const inspectSkinOutput = async (
  skinRoot: string,
  suffix: string
): Promise<SkinOutputInspection> => {
  const resolved = resolveSkinOutputDir(skinRoot, suffix);
  if (!resolved.ok) {
    return { ...emptyInspection(resolved.suffix), ok: false, error: resolved.error };
  }
  const base: SkinOutputInspection = { ...emptyInspection(resolved.suffix), dir: resolved.dir };
  let stat;
  try {
    stat = await fsp.lstat(resolved.dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return base;
    }
    return {
      ...base,
      ok: false,
      error: `读取皮肤目录失败：${(error as Error).message}`,
    };
  }
  if (stat.isSymbolicLink()) {
    return { ...base, ok: false, exists: true, error: '目标是一个符号链接，已拒绝清理' };
  }
  if (!stat.isDirectory()) {
    return { ...base, ok: false, exists: true, error: '目标不是文件夹，已拒绝清理' };
  }
  const measured = await measureSkinOutput(resolved.dir);
  return { ...base, exists: true, ...measured };
};

/**
 * 删除 `<皮肤存储路径>/<皮肤目录名称>`。目录不存在时返回成功但 `removed: false`，
 * 由调用方决定怎么提示（不自动重建空目录）。
 *
 * `maxRetries` 留给 Windows 上被杀毒/索引/游戏短暂占用的情况；仍然失败就把错误
 * 原样带回，不会假装删干净。
 */
export const clearSkinOutput = async (
  skinRoot: string,
  suffix: string
): Promise<ClearSkinOutputResult> => {
  const info = await inspectSkinOutput(skinRoot, suffix);
  if (!info.ok || !info.exists) {
    return { ...info, removed: false };
  }
  try {
    await fsp.rm(info.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    return {
      ...info,
      ok: false,
      removed: false,
      error: `删除失败：${(error as Error).message}（可能有程序正在使用里面的文件）`,
    };
  }
  try {
    await fsp.access(info.dir);
    return { ...info, ok: false, removed: false, error: '删除后目录仍然存在，请检查是否被占用' };
  } catch {
    // access 抛 ENOENT 才是删干净了
  }
  return { ...info, removed: true };
};

/** 确认框 / 通知里显示的体积（不引第三方包，保持模块可在测试里直接跑） */
export const formatBytes = (bytes: number): string => {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
};
