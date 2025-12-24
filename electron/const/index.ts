import path from 'node:path';
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
export const SKIN_IMAGE_KEY = 'SKIN_IMAGE';
