import path from 'node:path';
import { app } from 'electron';
import { ModToolsWrapper } from '../export/modToolsWrapper';

let temp_dir = `${process.env.LOCALAPPDATA}\\lol-skin-ll`; // aka C:\Users\用户名\AppData\Local\ghs4.0
const cache_path = path.join(process.cwd(), '\\lsl-cache');

export class APP_PATHS {
  static get db_dir() {
    return temp_dir;
  }

  static get cache_path() {
    return cache_path;
  }
}
export const modToolsWrapper = new ModToolsWrapper();
export const tempPath = temp_dir;
export const configPath = path.join(temp_dir, 'config.json');
export const defaultOverlayConfigPath = path.join(temp_dir, 'overlay.json');
export const defaultSkinPath = path.join(temp_dir, 'skins');
export const defaultOverlayPath = path.join(temp_dir, 'overlays');
export const defaultGamePath = 'E:\\game\\Riot Games\\League of Legends\\Game';
export const defaultModToolsPath = path.join(temp_dir, 'mod-tools\\mod-tools.exe');
export const defaultInstalledPath = path.join(temp_dir, 'installed');
export const defaultScreenshotPath = path.join(app.getPath('pictures'), 'lolskinsupport');
export const SKIN_IMAGE_KEY = 'SKIN_IMAGE';
/** 语言自动修复：Riot 配置文件路径 */
export const LOCALE_WATCHER_FILE = 'LOCALE_WATCHER_FILE';
/** 语言自动修复：目标语言 */
export const LOCALE_WATCHER_LOCALE = 'LOCALE_WATCHER_LOCALE';
/** 语言自动修复：是否启用 */
export const LOCALE_WATCHER_ENABLED = 'LOCALE_WATCHER_ENABLED';
export let IS_USE_COMMAND = false;
export const setUseCommand = (flag: boolean) => {
  IS_USE_COMMAND = flag;
};
