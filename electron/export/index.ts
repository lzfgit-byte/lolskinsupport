import * as Path from 'node:path';
import path from 'node:path';
import fs, { appendFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { dialog, shell } from 'electron';
import { ensureFileSync, existsSync, readFileSync, writeFileSync } from 'fs-extra';
import {
  GAME_PATH,
  HERO_SKIN,
  INSTALLED_PATH,
  MOD_TOOLS_PATH,
  OVERLAY_CONFIG_PATH,
  OVERLAY_PATH,
  SKIN_PATH,
} from '@ghs/constant';
import type { ShowSliderConfirmType } from '@ghs/constant';
import {
  SKIN_IMAGE_KEY,
  configPath,
  defaultGamePath,
  defaultInstalledPath,
  defaultModToolsPath,
  defaultOverlayConfigPath,
  defaultOverlayPath,
  defaultSkinPath,
  modToolsWrapper,
  tempPath,
} from '../const';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import { showSliderConfirm } from '../hooks/use-confirm-window';
import { lcuConnector } from '../http/lcuConnector';
import {
  SKIN_DEFAULT_SUFFIX,
  loadSkinData,
  loadSkinDataByFile,
  setConfigData,
  unpackWadFile,
} from './load-skin-data';

export * from '../http';
const idName = {};
export const setIdName = (heroList: any[]) => {
  setConfigData(getGamePath(), getSkinPath(), getModToolsPath());
  heroList?.forEach((item) => {
    idName[item.heroId] = item.alias;
  });
  LogMsgUtil.sendLogMsg(tempPath);
};
export const loadSkinDataIdName = async (chuckSize = 20) => {
  loadSkinData(idName, chuckSize);
};
export const loadSkinDataByFilePath = async (fullWadPath: string, current = -1) => {
  loadSkinDataByFile(idName, fullWadPath, null, current);
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
  d[skinId] = skinImage;
  setConfig(SKIN_IMAGE_KEY, JSON.stringify(d, null, 2));
};
export const clearSkinImage = async () => {
  setConfig(SKIN_IMAGE_KEY, '{}');
  await modToolsWrapper.forceKillModTools();
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
    const fullPath = path.join(dir, file);
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
  return findFile(Path.join(getSkinPath(), SKIN_DEFAULT_SUFFIX), `${heroId}_${+curSkinId}.zip`);
};
export const checkHasSkins = (heroId: string, skinId: string) => {
  const skinPath = buildSkinPath(heroId, skinId);
  return existsSync(skinPath);
};
const useConstData = (heroId: string, skinId: string) => {
  const command = getModToolsPath();
  const uniqueId = `${heroId}_${skinId}`;
  const overlayPath = `${getOverlayPath()}\\${uniqueId}`;
  const overlayPathConfig = `${getOverlayConfigPath()}`;
  const gamePath = getGamePath();
  const installedPath = `${getInstalledPath()}\\${uniqueId}`;
  return { command, uniqueId, overlayPath, overlayPathConfig, gamePath, installedPath };
};
/**
 * mod-tools.exe
 * import
 * "C:\Users\18074\Downloads\LeagueSkins-main\LeagueSkins-main\skins\1\1001\1001.zip"
 * "D:\\WeGameApps\\installed\\11001"
 * --game:"E:\\game\\Riot Games\\League of Legends\\Game"
 * --noTFT
 *
 * mod-tools.exe
 * mkoverlay
 * "D:\\WeGameApps\\installed"
 * "D:\\WeGameApps\\preset_temp_1763828056312"
 * --game:"E:\\game\\Riot Games\\League of Legends\\Game"
 * --mods:11001
 * --ignoreConflict
 *
 *
 *
 * mod-tools.exe
 * runoverlay
 * "D:\\WeGameApps\\preset_temp_1763828056312"
 * "C:\\Users\\18074\\AppData\\Roaming\\bocchi\\presets.json"
 * --game:"E:\\game\\Riot Games\\League of Legends\\Game"
 * --opts:none
 */
export const loadSkin = async (heroId: string, skinId: string, skinImage: string) => {
  await mkOverlay(heroId, skinId, skinImage);
  const { command, uniqueId, overlayPath, overlayPathConfig, gamePath } = useConstData(
    heroId,
    skinId
  );
  fs.writeFileSync(overlayPathConfig, JSON.stringify([skinId]), { flag: 'w', encoding: 'utf-8' });
  await modToolsWrapper
    .runOverlay(command, [
      'runoverlay',
      Path.normalize(overlayPath),
      Path.normalize(overlayPathConfig),
      `--game:${Path.normalize(gamePath)}`,
      '--opts:none',
    ])
    .catch((msg) => {
      MessageUtil.error(msg);
    });
  showToast(`runoverlay --${uniqueId}--成功`);
};

export const mkOverlay = async (heroId: string, skinId: string, skinImage: string) => {
  const { command, uniqueId, overlayPath, gamePath, installedPath } = useConstData(heroId, skinId);
  if (!existsSync(command)) {
    MessageUtil.error(`${command} not exists`);
    return;
  }
  const skinPath = buildSkinPath(heroId, skinId);
  if (!existsSync(skinPath)) {
    MessageUtil.error(`${skinPath} not exists`);
    return;
  }
  setHeroChoseSkin(heroId, skinId);
  setSkinImage(skinId, skinImage);
  await modToolsWrapper.forceKillModTools();
  if (!existsSync(installedPath)) {
    await modToolsWrapper
      .execToolWithTimeout(
        command,
        [
          'import',
          Path.normalize(skinPath),
          Path.normalize(installedPath),
          `--game:${Path.normalize(gamePath)}`,
          '--noTFT',
        ],
        5000,
        true
      )
      .catch((msg) => {
        MessageUtil.error(msg);
      });
    showToast(`导入皮肤成功:${uniqueId}`);
  } else {
    showToast(`已经安装过:${uniqueId}`);
  }

  if (!existsSync(overlayPath)) {
    await modToolsWrapper
      .execToolWithTimeout(
        command,
        [
          'mkoverlay',
          Path.normalize(getInstalledPath()),
          Path.normalize(overlayPath),
          `--game:${Path.normalize(gamePath)}`,
          `--mods:${uniqueId}`,
          '--ignoreConflict',
        ],
        50000,
        true
      )
      .catch((msg) => {
        MessageUtil.error(msg);
      });
  } else {
    showToast(`mkoverlay --${uniqueId}--成功`);
  }
};
function copyRecursive(src: string, dest: string) {
  const stat = fs.statSync(src);

  // 如果是文件，直接复制到 dest
  if (stat.isFile()) {
    const destFile = path.join(dest, path.basename(src));
    fs.copyFileSync(src, destFile);
    return;
  }

  // 如果是文件夹，复制其内部内容（不复制 src 目录本身）
  if (stat.isDirectory()) {
    const items = fs.readdirSync(src);

    for (const item of items) {
      const itemSrc = path.join(src, item);
      const itemStat = fs.statSync(itemSrc);

      if (itemStat.isFile()) {
        // 文件 → 直接复制到 dest
        const destFile = path.join(dest, item);
        fs.copyFileSync(itemSrc, destFile);
      } else if (itemStat.isDirectory()) {
        // 子目录 → 在 dest 下创建同名目录
        const newDestDir = path.join(dest, item);
        if (!fs.existsSync(newDestDir)) {
          fs.mkdirSync(newDestDir);
        }
        // 递归复制子目录内容
        copyRecursive(itemSrc, newDestDir);
      }
    }
  }
}

export const loadSkins = async () => {
  const command = getModToolsPath();
  const overlayPath = getOverlayPath();
  const overlayPathAll = path.join(overlayPath, 'all');
  const overlayPathConfig = getOverlayConfigPath();
  const gamePath = getGamePath();

  // 确保 all 是目录，而不是文件
  if (!fs.existsSync(overlayPathAll)) {
    fs.mkdirSync(overlayPathAll, { recursive: true });
  }

  // 清空 all 目录
  emptyDir(overlayPathAll);
  // 获取同级目录（排除 all）
  const folders = fs
    .readdirSync(overlayPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'all')
    .map((dirent) => dirent.name);

  // 提取 skinId
  const setHeroId = new Set();
  const skinIds = folders.map((name) => {
    const nArr = name.split('_');
    setHeroId.add(nArr[0]);
    return nArr[1];
  });
  if (setHeroId.size !== skinIds.length) {
    MessageUtil.error('相同英雄皮肤重复');
    showToast('相同英雄皮肤重复');
    return;
  }
  if (skinIds.length === 0) {
    MessageUtil.error('没有皮肤');
    showToast('没有皮肤');
    return;
  }
  // 复制每个文件夹内容到 all
  folders.forEach((folder) => {
    const folderPath = path.join(overlayPath, folder);
    copyRecursive(folderPath, overlayPathAll);
  });

  // 写入配置
  fs.writeFileSync(overlayPathConfig, JSON.stringify(skinIds), {
    encoding: 'utf-8',
    flag: 'w',
  });

  await modToolsWrapper.forceKillModTools();
  await modToolsWrapper
    .runOverlay(command, [
      'runoverlay',
      Path.normalize(overlayPathAll),
      Path.normalize(overlayPathConfig),
      `--game:${Path.normalize(gamePath)}`,
      '--opts:none',
    ])
    .catch((msg) => {
      MessageUtil.error(msg);
    });
  showToast(`runoverlay --all--成功`);
};
export const getAllLoadSkins = () => {
  const overlayPath = getOverlayPath();
  const folders = fs
    .readdirSync(overlayPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'all')
    .map((dirent) => dirent.name);

  // 提取 skinId
  return folders.map((name) => name.split('_')[1]);
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
  const normalized = path.normalize(path_);
  try {
    const stat = fs.statSync(normalized);
    if (stat.isFile()) {
      // 如果是文件，打开父级目录
      shell.openPath(path.dirname(normalized));
    } else {
      // 如果是目录，直接打开
      shell.openPath(normalized);
    }
  } catch (err) {
    console.error('路径不存在或无法访问:', err);
  }
};
export const removePath = (path_: string) => {
  const normalized = path.normalize(path_);
  try {
    const stat = fs.statSync(normalized);
    if (stat.isFile()) {
      // 如果是文件，打开父级目录
      fs.rmdirSync(path.dirname(normalized));
    } else {
      // 如果是目录，直接打开
      modToolsWrapper.ensureCleanDirectoryWithRetry(normalized);
    }
  } catch (err) {
    console.error('路径不存在或无法访问:', err);
    MessageUtil.error(`删除失败${err.message}`);
    return;
  }
  MessageUtil.success(`删除成功:${path_}`);
};
export const openUrl = (url: string) => {
  shell.openExternal(url);
};
function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

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

export const shoutDownModTools = async () => {
  await modToolsWrapper.forceKillModTools();
  MessageUtil.success('已关闭ModTools');
};
export const unpackWadFileTo = async (fullWadPath) => {
  return unpackWadFile(fullWadPath);
};
