/**
 * 随包工具目录（`wad-make.exe` / `wad-extract.exe` / `ritobin` + 名字表 …）在哪。
 *
 * 打包后：`<安装目录>\resources\tools`（electron-builder 的 extraResources，
 * 见 electron-builder.json5；源就是仓库里的 `native/tools`）。
 * 开发时：仓库里的 `native/tools`。
 *
 * 工具目录里有两样「别人以为很大」的东西，我们都不带：
 *
 *   - `hashes.game.txt`（219 MB）：只用它筛「皮肤 bin 的路径 + 哈希」，结果存成
 *     `skinbins-index.txt`（21446 条 / 1.25 MB）随包带走，见 `electron/export/wad-index.ts`；
 *   - `ltk-manager.exe`（95 MB）：注入用的是系统安装的 LTK Manager，
 *     找不到才提示安装（见 `electron/export/ltfSession.ts` 的 `resolveLtkManager()`）。
 *
 * 用户数据目录（`config.json` / `skins` / `overlays`）仍然在
 * `%LOCALAPPDATA%\lol-skin-ll`，没有变。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOOLS_DIR_NAME = 'tools';
const USER_DATA_DIR_NAME = 'lol-skin-ll';

/** 打包后 resources/tools；开发时 <仓库>/native/tools */
export const bundledToolsDir = (): string => {
  // vite dev（electron .）里 defaultApp 是 true；打包后不存在
  if ((process as any).defaultApp) {
    return path.join(process.cwd(), 'native', TOOLS_DIR_NAME);
  }
  const resources = process.resourcesPath || path.join(process.cwd(), 'resources');
  return path.join(resources, TOOLS_DIR_NAME);
};

/** 旧版「初始化配置环境」解压的位置（只用来识别老配置，不再往里写东西） */
export const legacyToolsDir = (): string =>
  path.join(process.env.LOCALAPPDATA || os.tmpdir(), USER_DATA_DIR_NAME, TOOLS_DIR_NAME);

/**
 * 工具目录：跟着安装包走。
 *
 * 不再回退到旧版解压目录 —— 那份里没有 `skinbins-index.txt`，回退过去也构建不了，
 * 反而把错误指向一个看起来「有工具」的地方。
 */
export const resolveToolsDir = (): string => bundledToolsDir();

/** 配置里存的那个工具路径是不是「我们自己的」（升级后要迁到随包那份） */
export const isManagedToolsPath = (value: string): boolean => {
  const normalize = (text: string) => `${text}`.replace(/\//g, '\\').toLowerCase();
  const dir = normalize(path.dirname(`${value}`));
  return dir === normalize(legacyToolsDir()) || dir === normalize(bundledToolsDir());
};

/** 皮肤 bin 索引：每行 `<16 位路径哈希> <data/characters/.../skin<n>.bin>` */
export const resolveSkinBinIndexPath = (toolsDir: string = resolveToolsDir()): string =>
  path.join(toolsDir, 'skinbins-index.txt');

/** 判断工具目录是否完整（缺一个就算没铺好） */
export const REQUIRED_TOOL_FILES = [
  'mod-tools.exe',
  'wad-make.exe',
  'wad-extract.exe',
  'skinbins-index.txt',
  path.join('ritobin', 'bin', 'ritobin_cli.exe'),
];

export const missingToolFiles = (toolsDir: string = resolveToolsDir()): string[] =>
  REQUIRED_TOOL_FILES.filter((relative) => !fs.existsSync(path.join(toolsDir, relative)));
