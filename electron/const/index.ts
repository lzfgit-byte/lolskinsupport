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
/** 多杀截图：是否启用自动截图 */
export const defaultMultiKillCaptureEnabled = true;
/** 多杀截图：收到多杀事件后、开始连拍前的等待时间（毫秒） */
export const defaultMultiKillCaptureDelay = 1200;
/** 多杀截图：连拍总时长（毫秒），最终保存最后一帧 */
export const defaultMultiKillCaptureWindow = 800;
/** 多杀截图：调试模式，把连拍过程中的每一帧都保存下来 */
export const defaultMultiKillCaptureDebug = false;
/** 多杀截图：总开关配置项 key */
export const MULTIKILL_CAPTURE_ENABLED = 'MULTIKILL_CAPTURE_ENABLED';
/** 多杀截图：等待时间配置项 key */
export const MULTIKILL_CAPTURE_DELAY = 'MULTIKILL_CAPTURE_DELAY';
/** 多杀截图：连拍时长配置项 key */
export const MULTIKILL_CAPTURE_WINDOW = 'MULTIKILL_CAPTURE_WINDOW';
/** 多杀截图：调试开关配置项 key */
export const MULTIKILL_CAPTURE_DEBUG = 'MULTIKILL_CAPTURE_DEBUG';
/** 语言自动修复：Riot 配置文件路径 */
export const LOCALE_WATCHER_FILE = 'LOCALE_WATCHER_FILE';
/** 语言自动修复：目标语言 */
export const LOCALE_WATCHER_LOCALE = 'LOCALE_WATCHER_LOCALE';
/** 语言自动修复：是否启用 */
export const LOCALE_WATCHER_ENABLED = 'LOCALE_WATCHER_ENABLED';
/** 启动游戏：Riot 客户端路径（RiotClientServices.exe） */
export const RIOT_CLIENT_PATH = 'RIOT_CLIENT_PATH';
export let IS_USE_COMMAND = false;
export const setUseCommand = (flag: boolean) => {
  IS_USE_COMMAND = flag;
};
