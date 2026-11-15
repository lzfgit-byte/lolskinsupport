import fs, { appendFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import Path from 'node:path';
import { dialog, shell } from 'electron';
import { ensureFileSync, existsSync, readFileSync, writeFileSync } from 'fs-extra';
import {
  GAME_PATH,
  HERO_SKIN,
  INSTALLED_PATH,
  MOD_TOOLS_PATH,
  OVERLAY_CONFIG_PATH,
  OVERLAY_PATH,
  SCREENSHOT_PATH,
  SKIN_PATH,
} from '@ghs/constant';
import type { ShowSliderConfirmType } from '@ghs/constant';
import {
  IS_USE_COMMAND,
  SKIN_IMAGE_KEY,
  configPath,
  defaultGamePath,
  defaultInstalledPath,
  defaultModToolsPath,
  defaultOverlayConfigPath,
  defaultOverlayPath,
  defaultScreenshotPath,
  defaultSkinPath,
  modToolsWrapper,
  setUseCommand,
  tempPath,
} from '../const';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import { showSliderConfirm } from '../hooks/use-confirm-window';
import { lcuConnector } from '../http/lcuConnector';
import { loadSkinData, loadSkinDataByFile, setConfigData, unpackWadFile } from './load-skin-data';
import { ltfInjector } from './ltfSession';
import { importLeagueSkinsFromZip } from './league-skins-import';

export * from '../http';
export * from './locale-watcher';
export * from './launch-game';
export * from './lol-data';
export * from './match-history';
export * from './remote-cache';
export * from '../utils/screenshot-config';
const idName = {};
const SKIN_DEFAULT_SUFFIX_CONFIG_KEY = 'SKIN_DEFAULT_SUFFIX';
const defaultSkinSuffix = 'leagueSkins';
export const setIdName = (heroList: any[]) => {
  setConfigData(getGamePath(), getSkinPath(), getModToolsPath(), getSkinDefaultSuffix());
  heroList?.forEach((item) => {
    idName[item.heroId] = item.alias;
  });
  LogMsgUtil.sendLogMsg(tempPath);
};
export const loadSkinDataIdName = async (chuckSize = 20) => {
  setConfigData(getGamePath(), getSkinPath(), getModToolsPath(), getSkinDefaultSuffix());
  await loadSkinData(idName, chuckSize);
};
export const loadSkinDataByFilePath = async (fullWadPath: string, current = -1) => {
  setConfigData(getGamePath(), getSkinPath(), getModToolsPath(), getSkinDefaultSuffix());
  await loadSkinDataByFile(idName, fullWadPath, null, current);
};
export const readConfig = () => {
  if (!existsSync(configPath)) {
    ensureFileSync(configPath);
    writeFileSync(configPath, JSON.stringify({}));
  }
  return JSON.parse(readFileSync(configPath, { encoding: 'utf-8' }));
};
export const setConfig = (key: string, value: string) => {
  const config = readConfig();
  config[key] = value;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
};
export const readConfigValue = (key: string) => {
  const config = readConfig();
  return config[key];
};
export const readConfigOrDefault = (key: string, defaultValue: string) => {
  const value = readConfigValue(key);
  if (value) {
    return value;
  }
  setConfig(key, defaultValue);
  return defaultValue;
};

export const getSkinPath = () => {
  return readConfigOrDefault(SKIN_PATH, defaultSkinPath);
};
export const getScreenshotPath = () => {
  return readConfigOrDefault(SCREENSHOT_PATH, defaultScreenshotPath);
};
export const setScreenshotPath = (path_: string) => {
  setConfig(SCREENSHOT_PATH, path_);
};
export const getSkinDefaultSuffix = () => {
  const suffix = readConfigOrDefault(SKIN_DEFAULT_SUFFIX_CONFIG_KEY, defaultSkinSuffix);
  return suffix?.trim() || defaultSkinSuffix;
};
export const getGamePath = () => {
  return readConfigOrDefault(GAME_PATH, defaultGamePath);
};
export const getOverlayPath = () => {
  return readConfigOrDefault(OVERLAY_PATH, defaultOverlayPath);
};
export const getOverlayConfigPath = () => {
  const r = readConfigOrDefault(OVERLAY_CONFIG_PATH, defaultOverlayConfigPath);
  if (!existsSync(r)) {
    ensureFileSync(r);
    writeFileSync(r, JSON.stringify([], null, 2));
  }
  return r;
};
export const setHeroChoseSkin = (heroId: string, skinId: string) => {
  const data = readConfigOrDefault(HERO_SKIN, '{}');
  const d = JSON.parse(data);
  d[heroId] = skinId;
  setConfig(HERO_SKIN, JSON.stringify(d, null, 2));
};
export const getHeroChoseSkin = (heroId: string) => {
  const data = readConfigOrDefault(HERO_SKIN, '{}');
  const d = JSON.parse(data);
  return d[heroId] || '';
};
export const setSkinImage = (skinId: string, skinImage: string) => {
  const data = readConfigOrDefault(SKIN_IMAGE_KEY, '{}');
  const d = JSON.parse(data);
  if (skinImage) {
    d[skinId] = skinImage;
  } else {
    delete d[skinId];
  }
  setConfig(SKIN_IMAGE_KEY, JSON.stringify(d, null, 2));
};
export const clearSkinImage = async (skinId?: string) => {
  if (skinId) {
    setSkinImage(skinId, null);
    return;
  }
  setConfig(SKIN_IMAGE_KEY, '{}');
};
export const getSkinImage = (skinId: string) => {
  const data = readConfigOrDefault(SKIN_IMAGE_KEY, '{}');
  const d = JSON.parse(data);
  return d[skinId] || '';
};
export const getModToolsPath = () => {
  return readConfigOrDefault(MOD_TOOLS_PATH, defaultModToolsPath);
};
export const getInstalledPath = () => {
  return readConfigOrDefault(INSTALLED_PATH, defaultInstalledPath);
};
export const findFile = (dir, targetFile) => {
  if (!fs.existsSync(dir)) {
    return null;
  }
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = Path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 递归搜索子目录
      const result = findFile(fullPath, targetFile);
      if (result) {
        return result;
      }
    } else if (file === targetFile) {
      return fullPath;
    }
  }
  return null;
};
const buildSkinPath = (heroId: string, skinId: string) => {
  const curSkinId = skinId.replace(heroId, '');
  const skinBasePath = getSkinDefaultSuffix();
  const skinPath = Path.join(
    getSkinPath(),
    skinBasePath,
    `${heroId}`,
    `${heroId}_${+curSkinId}.zip`
  );
  if (fs.existsSync(skinPath)) {
    return skinPath;
  }

  const foundPath = findFile(
    Path.join(getSkinPath(), skinBasePath, heroId),
    `${heroId}_${+curSkinId}.zip`
  );
  if (foundPath) {
    return foundPath;
  }

  return Path.join(
    getSkinPath(),
    getSkinDefaultSuffix(),
    `${heroId}`,
    `${heroId}_${+curSkinId}.zip`
  );
};
export const checkHasSkins = (heroId: string, skinId: string) => {
  const skinPath = buildSkinPath(`${heroId}`, `${skinId}`);
  return existsSync(skinPath);
};
/** 已启用皮肤的账本：overlays/<heroId>_<skinId> 目录，「皮肤使用中」页面按它列皮肤 */
const markAppliedSkin = (heroId: string, skinId: string) => {
  fs.mkdirSync(Path.join(getOverlayPath(), `${heroId}_${skinId}`), { recursive: true });
};

const listAppliedSkins = () => {
  const overlayPath = getOverlayPath();
  if (!fs.existsSync(overlayPath)) {
    return [];
  }
  return fs
    .readdirSync(overlayPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'all')
    .map((dirent) => dirent.name)
    .map((name) => name.split('_'))
    .filter((parts) => parts.length >= 2)
    .map(([heroId, skinId]) => ({ heroId, skinId }));
};

/**
 * 注入皮肤 —— 按 Rose 1.5 的方式：
 *   皮肤压缩包原样装进 LTK Manager 的模组库 → 只启用它 → 让 LTK Manager 启动
 *   自己的 patcher。不再生成 overlay，也不再用 mod-tools.exe import / mkoverlay
 *   或用户自备的 ltk_patcher_host.exe。
 *
 * *record* 为 true 时把皮肤记进「皮肤使用中」列表。
 */
const injectSkin = async (
  heroId: string,
  skinId: string,
  skinImage: string,
  record: boolean
): Promise<boolean> => {
  const skinPath = buildSkinPath(heroId, skinId);
  if (!existsSync(skinPath)) {
    showToast(`${skinPath} not exists`);
    return false;
  }
  setHeroChoseSkin(heroId, skinId);
  setSkinImage(skinId, skinImage);
  const applied = await ltfInjector.applySkins([{ archive: skinPath, heroId, skinId }]);
  if (!applied.ok) {
    return false;
  }
  if (record) {
    markAppliedSkin(heroId, skinId);
    fs.writeFileSync(getOverlayConfigPath(), JSON.stringify([skinId]), { encoding: 'utf-8' });
  }
  showToast(`已注入 --${heroId}_${skinId}--`);
  return true;
};

/** 使用皮肤：注入并记录到「皮肤使用中」 */
export const loadSkin = async (heroId: string, skinId: string, skinImage: string) => {
  return injectSkin(heroId, skinId, skinImage, true);
};

/** 只注入，不记录（原来「构建 overlay」的位置，现在没有中间 overlay 了） */
export const mkOverlay = async (heroId: string, skinId: string, skinImage: string) => {
  return injectSkin(heroId, skinId, skinImage, false);
};

export const loadSkins = async () => {
  const overlayPathConfig = getOverlayConfigPath();
  const applied = listAppliedSkins();
  if (applied.length === 0) {
    MessageUtil.error('没有皮肤');
    showToast('没有皮肤');
    return;
  }

  const skins = [];
  let missing = 0;
  for (const { heroId, skinId } of applied) {
    const archive = buildSkinPath(heroId, skinId);
    if (!existsSync(archive)) {
      missing++;
      continue;
    }
    skins.push({ archive, heroId, skinId });
  }
  if (missing > 0) {
    MessageUtil.warning(`有 ${missing} 个皮肤文件不存在，已跳过`);
  }
  if (skins.length === 0) {
    MessageUtil.error('没有可注入的皮肤文件');
    return;
  }

  // 全部装进 LTK Manager 的库并启用，一次 patcher 覆盖所有英雄
  const result = await ltfInjector.applySkins(skins);
  if (!result.ok) {
    return;
  }
  fs.writeFileSync(overlayPathConfig, JSON.stringify(skins.map((item) => item.skinId)), {
    encoding: 'utf-8',
    flag: 'w',
  });
  showToast(`已注入 ${skins.length} 个皮肤`);
};
export const getAllLoadSkins = () => {
  const overlayPath = getOverlayPath();
  const folders = fs
    .readdirSync(overlayPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'all')
    .map((dirent) => dirent.name);

  // 提取 skinId
  return folders.map((name) => name.split('_'));
};
export const checkCanAutoConfirm = (opt: ShowSliderConfirmType) => {
  return new Promise((resolve) => {
    showSliderConfirm(
      opt,
      () => {
        resolve(true);
      },
      () => {
        resolve(false);
      }
    );
  });
};
export const openPath = (path_: string) => {
  const normalized = Path.normalize(path_);
  try {
    const stat = fs.statSync(normalized);
    if (stat.isFile()) {
      // 如果是文件，打开父级目录
      shell.openPath(Path.dirname(normalized));
    } else {
      // 如果是目录，直接打开
      shell.openPath(normalized);
    }
  } catch (err) {
    console.error('路径不存在或无法访问:', err);
  }
};
export const emptyPah = async (path_: string, silent = false) => {
  const normalized = Path.normalize(path_);
  try {
    if (!fs.existsSync(normalized)) {
      return;
    }
    const stat = fs.statSync(normalized);
    if (!stat.isFile()) {
      // 如果是目录，直接打开
      await modToolsWrapper.ensureCleanDirectoryWithRetry(normalized);
    }
  } catch (err) {
    MessageUtil.error(`清空文件夹：${err.message}`);
    return;
  }
  if (!silent) {
    MessageUtil.success(`清空文件夹:${path_}`);
  }
};
export const removePath = async (path_: string, silent = false) => {
  const normalized = Path.normalize(path_);
  try {
    if (!fs.existsSync(normalized)) {
      return;
    }
    const stat = fs.statSync(normalized);
    if (stat.isFile()) {
      // 如果是文件，打开父级目录
      fs.rmdirSync(Path.dirname(normalized));
    } else {
      // 如果是目录，直接打开
      await modToolsWrapper.ensureCleanDirectoryWithRetry(normalized);
      fs.rmdirSync(normalized);
    }
  } catch (err) {
    console.error('路径不存在或无法访问:', err);
    MessageUtil.error(`删除失败${err.message}`);
    return;
  }
  if (!silent) {
    MessageUtil.success(`删除成功:${path_}`);
  }
};
export const openUrl = (url: string) => {
  shell.openExternal(url);
};

export const confirmChoseSkin = async (msg: string, imageSrc: string) => {
  return checkCanAutoConfirm({
    title: '提示',
    msg,
    src: imageSrc,
    showBtn: true,
    height: 250,
    delay: 3000,
  });
};
export const showToast = async (msg: string) => {
  showSliderConfirm({
    title: '提示',
    msg,
    height: 80,
    delay: 3000,
  });
};
export const selectPathOrFile = async (
  properties: 'openFile' | 'openDirectory' | 'all' = 'all',
  defaultPath: string
) => {
  const cp = properties === 'all' ? ['openFile', 'openDirectory'] : [properties];
  const result = await dialog.showOpenDialog({
    properties: cp as any, // 允许选择文件或文件夹
    defaultPath,
  });

  if (result.canceled) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  return selectedPath;
};

/**
 * 导入 LeagueSkins 的整包（`skins/<英雄>/<皮肤>/<皮肤>.fantome`）。
 *
 * 真正的解压在 league-skins-import.ts 里，按需流式读取，整包多大都不会
 * 撑爆内存（adm-zip 会 readFileSync 整个包，超过 2 GiB 直接抛
 * ERR_FS_FILE_TOO_LARGE）。
 */
export const importLeagueSkinsPackage = async () => {
  LogMsgUtil.sendLogMsg('[LeagueSkins导入] 开始选择压缩包');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    defaultPath: getSkinPath(),
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  });

  if (result.canceled || !result.filePaths[0]) {
    LogMsgUtil.sendLogMsg('[LeagueSkins导入] 已取消');
    return { canceled: true, count: 0, outDir: '' };
  }

  const imported = await importLeagueSkinsFromZip({
    zipPath: result.filePaths[0],
    skinRoot: getSkinPath(),
    suffix: getSkinDefaultSuffix(),
    log: (message) => LogMsgUtil.sendLogMsg(message),
  });

  if (imported.failed > 0 && imported.count === 0) {
    MessageUtil.error(`导入失败：${imported.failed} 个皮肤都没能写入，详见日志`);
  } else if (imported.count === 0) {
    MessageUtil.error('未找到可导入的 LeagueSkins 皮肤文件');
  } else {
    MessageUtil.success(
      `导入 LeagueSkins 皮肤成功：${imported.count} 个${
        imported.skipped ? `，已存在 ${imported.skipped} 个` : ''
      }${imported.failed ? `，失败 ${imported.failed} 个` : ''}`
    );
  }

  return imported;
};

export const shoutDownModTools = async () => {
  // 停止注入：停 patcher、撤掉本次导入、把用户的模组开回去
  await ltfInjector.stop();
  MessageUtil.success('已停止注入');
};
export const unpackWadFileTo = async (fullWadPath) => {
  return unpackWadFile(fullWadPath);
};
export const setIsUseCommand = (isUseCommand: boolean) => {
  setUseCommand(isUseCommand);
};
