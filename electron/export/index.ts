import path from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs-extra';
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
const SKIN_PATH = 'SKIN_PATH';
const GAME_PATH = 'GAME_PATH';
const OVERLAY_PATH = 'OVERLAY_PATH';
const OVERLAY_CONFIG_PATH = 'OVERLAY_CONFIG_PATH';
const MOD_TOOLS_PATH = 'MOD_TOOLS_PATH';
const modToolsWrapper = new ModToolsWrapper();
export const readConfig = () => {
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({}));
  }
  return JSON.parse(readFileSync(configPath, { encoding: 'utf-8' }));
};
export const setConfig = (key: string, value: string) => {
  const config = readConfig();
  config[key] = value;
  writeFileSync(configPath, JSON.stringify(config));
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
  readConfigOrDefault(GAME_PATH, defaultGamePath);
};
export const getOverlayPath = () => {
  return readConfigOrDefault(OVERLAY_PATH, defaultOverlayPath);
};
export const getOverlayConfigPath = () => {
  return readConfigOrDefault(OVERLAY_CONFIG_PATH, defaultOverlayConfigPath);
};
export const getDefaultModToolsPath = () => {
  return readConfigOrDefault(MOD_TOOLS_PATH, defaultModToolsPath);
};
export const loadSkin = async (...args: string[]) => {
  const command = getDefaultModToolsPath();
  if (!existsSync(command)) {
    return;
  }
  return modToolsWrapper.execToolWithTimeout(command, args, 5000);
};
