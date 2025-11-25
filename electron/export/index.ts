import * as Path from 'node:path';
import path from 'node:path';
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

import { shell } from 'electron';
import {
  configPath,
  defaultGamePath,
  defaultInstalledPath,
  defaultModToolsPath,
  defaultOverlayConfigPath,
  defaultOverlayPath,
  defaultSkinPath,
  modToolsWrapper,
} from '../const';
import { MessageUtil } from '../utils/message';
import { showSliderConfirm } from '../hooks/use-confirm-window';

export * from '../http';

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
export const getModToolsPath = () => {
  return readConfigOrDefault(MOD_TOOLS_PATH, defaultModToolsPath);
};
export const getInstalledPath = () => {
  return readConfigOrDefault(INSTALLED_PATH, defaultInstalledPath);
};
const buildSkinPath = (heroId: string, skinId: string) => {
  return `${getSkinPath()}\\${heroId}\\${skinId}\\${skinId}.zip`;
};
export const checkHasSkins = (heroId: string, skinId: string) => {
  const skinPath = buildSkinPath(heroId, skinId);
  return existsSync(skinPath);
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
 * @param heroId
 * @param skinId
 */
export const loadSkin = async (heroId: string, skinId: string) => {
  const command = getModToolsPath();
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
  const uniqueId = `${heroId}_${skinId}`;
  const overlayPath = `${getOverlayPath()}\\${uniqueId}`;
  const overlayPathConfig = `${getOverlayConfigPath()}`;
  const gamePath = getGamePath();
  const installedPath = `${getInstalledPath()}\\${uniqueId}`;
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
    showSliderConfirm(`安装皮肤成功:${uniqueId}`, null, null, 3000);
  } else {
    showSliderConfirm(`已经安装过:${uniqueId}`, null, null, 3000);
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
    showSliderConfirm(`已经mkoverlay:${uniqueId}`, null, null, 2000);
  }

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
  showSliderConfirm(`runoverlay --${uniqueId}--成功`);
};
export const checkCanAutoConfirm = (msg: string, delay = 3000) => {
  return new Promise((resolve) => {
    showSliderConfirm(
      msg,
      () => {
        resolve(true);
      },
      () => {
        resolve(false);
      },
      delay
    );
  });
};
export const openPath = (path_: string) => {
  shell.openPath(path.normalize(path_));
};
export const emptyPah = (path_: string) => {
  modToolsWrapper.ensureCleanDirectoryWithRetry(path_);
};
