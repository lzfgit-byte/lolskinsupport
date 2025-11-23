import { ensureFileSync, existsSync, readFileSync, writeFileSync } from 'fs-extra';
import {
  GAME_PATH,
  MOD_TOOLS_PATH,
  OVERLAY_CONFIG_PATH,
  OVERLAY_PATH,
  SKIN_PATH,
} from '@ghs/constant';

import {
  configPath,
  defaultGamePath,
  defaultModToolsPath,
  defaultOverlayConfigPath,
  defaultOverlayPath,
  defaultSkinPath,
} from '../const';
import { ModToolsWrapper } from './modToolsWrapper';

export * from '../http';

const modToolsWrapper = new ModToolsWrapper();
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
  return readConfigOrDefault(OVERLAY_CONFIG_PATH, defaultOverlayConfigPath);
};
export const getModToolsPath = () => {
  return readConfigOrDefault(MOD_TOOLS_PATH, defaultModToolsPath);
};
export const loadSkin = async (...args: string[]) => {
  const command = getModToolsPath();
  if (!existsSync(command)) {
    return;
  }
  return modToolsWrapper.execToolWithTimeout(command, args, 5000);
};
