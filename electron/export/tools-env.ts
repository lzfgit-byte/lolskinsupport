/**
 * 随包工具环境：状态检查 + 启动时自动对齐配置。
 *
 * 工具就是仓库里的 `native/tools`，打包时由 electron-builder 的 `extraResources`
 * 原样拷到 `<安装目录>\resources\tools`。不需要初始化、不需要解压：
 *
 *   - `ensureToolsConfigured()` 在程序启动时把 `MOD_TOOLS_PATH` 指到随包那份；
 *   - 只改「空的 / 旧版 `%LOCALAPPDATA%\lol-skin-ll\tools`」这类我们自己的路径，
 *     用户自己填的、文件还在的 cslol-tools 目录不动；
 *   - 用户数据目录（config.json / skins / overlays）位置没变。
 *
 * 工具目录里只有 15 个文件 / 19.2 MB：除了 wad-make / wad-extract / ritobin-tools，
 * 关键的 `skinbins-index.txt` 是从 219 MB 的 `hashes.game.txt` 里筛出来的
 * 「皮肤 bin 路径 + 哈希」（22662 条），见 `electron/export/wad-index.ts`。
 */

import fs from 'node:fs';
import path from 'node:path';
import { MOD_TOOLS_PATH } from '@ghs/constant';
import { configPath } from '../const';
import { patchJsonConfig, readJsonConfig } from '../utils/json-config';
import { isManagedToolsPath, missingToolFiles, resolveToolsDir } from '../utils/tools-path';

export interface ToolsEnvStatus {
  /** 关键工具都在 */
  ready: boolean;
  /** 实际生效的工具目录（打包后在 resources\tools） */
  toolsDir: string;
  /** 缺失的关键文件（相对路径） */
  missing: string[];
  /** 皮肤索引条数（从 skinbins-index.txt 头部的 `# skinbins-index:` 读） */
  indexEntries?: number;
  /** 皮肤索引生成时间（ISO，从头部 `# generated:` 读） */
  indexGeneratedAt?: string;
  /** 索引来源 hashes.game.txt 的修改时间（ISO，能看出表有多新） */
  indexSourceDate?: string;
}

/** 读索引文件头前三行（只有几百字节，不读整个 1.32 MB） */
const readIndexHeader = (
  toolsDir: string
): Pick<ToolsEnvStatus, 'indexEntries' | 'indexGeneratedAt' | 'indexSourceDate'> => {
  try {
    const file = path.join(toolsDir, 'skinbins-index.txt');
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(400);
      const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
      const head = buffer.subarray(0, read).toString('utf8');
      const entries = Number(/# skinbins-index:\s*(\d+)/.exec(head)?.[1]);
      const generatedAt = /# generated:\s*(.+)/.exec(head)?.[1]?.trim();
      const sourceDate = /mtime\s+([\d-]+T[\d:.]+Z)/.exec(head)?.[1];
      return {
        indexEntries: Number.isFinite(entries) ? entries : undefined,
        indexGeneratedAt: generatedAt || undefined,
        indexSourceDate: sourceDate || undefined,
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return {};
  }
};

export const getToolsEnvStatus = (): ToolsEnvStatus => {
  const toolsDir = resolveToolsDir();
  const missing = missingToolFiles(toolsDir);
  return { ready: missing.length === 0, toolsDir, missing, ...readIndexHeader(toolsDir) };
};

/**
 * 启动时把 `MOD_TOOLS_PATH` 对齐到随包工具；返回实际生效的路径。
 *
 * 安装包换了版本、工具换到 resources 里之后，老配置里那串
 * `%LOCALAPPDATA%\lol-skin-ll\tools\mod-tools.exe` 会被自动换掉。
 */
export const ensureToolsConfigured = (): { path: string; changed: boolean } => {
  const exe = path.join(resolveToolsDir(), 'mod-tools.exe');
  if (!fs.existsSync(exe)) {
    return { path: exe, changed: false };
  }
  const configured = `${readJsonConfig(configPath)?.[MOD_TOOLS_PATH] ?? ''}`
    .trim()
    .replace(/^"|"$/g, '');
  if (configured && fs.existsSync(configured) && !isManagedToolsPath(configured)) {
    // 用户自己指定、而且文件还在：尊重用户设置
    return { path: configured, changed: false };
  }
  if (configured === exe) {
    return { path: exe, changed: false };
  }
  patchJsonConfig(configPath, { [MOD_TOOLS_PATH]: exe });
  return { path: exe, changed: true };
};
