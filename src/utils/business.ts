import type { ShowSliderConfirmType } from '@ghs/constant';
import { requestHtmlByWindows } from '../../electron/http';
import { executeFunction } from '@/utils/ipc';

/**
 * 获取图片
 * export const getSkinPath = () => {
 * @param url
 */
export const f_getSkinPath = async (): Promise<string> => {
  return executeFunction('getSkinPath');
};
/**
 * export const getGamePath = () => {
 */
export const f_getGamePath = async (): Promise<string> => {
  return executeFunction('getGamePath');
};
/**
 * export const getOverlayPath = () => {
 */
export const f_getOverlayPath = async (): Promise<string> => {
  return executeFunction('getOverlayPath');
};
/**
 * export const getOverlayConfigPath = () => {
 */
export const f_getOverlayConfigPath = async (): Promise<string> => {
  return executeFunction('getOverlayConfigPath');
};
/**
 * export const getModToolsPath = () => {
 */
export const f_getModToolsPath = async (): Promise<string> => {
  return executeFunction('getModToolsPath');
};
/**
 * export const loadSkin = async (...args: string[]) => {
 */
export const f_loadSkin = async (heroId: string, skinId: string, skinImage: string) => {
  return executeFunction('loadSkin', heroId, skinId, skinImage);
};
/**
 * export const getInstalledPath = () => {
 */
export const f_getInstalledPath = async (): Promise<string> => {
  return executeFunction('getInstalledPath');
};
/**
 * export const checkHasSkins = (...args: string[]) => {}
 */
export const f_checkHasSkins = async (heroId: string, skinId: string) => {
  return executeFunction('checkHasSkins', heroId, skinId);
};
/**
 * export const getHeroChoseSkin = (heroId: string) => {
 */
export const f_getHeroChoseSkin = async (heroId: string) => {
  return executeFunction('getHeroChoseSkin', heroId);
};
/**
 * export const setHeroChoseSkin = (heroId: string, skinId: string) => {
 */
export const f_setHeroChoseSkin = async (heroId: string, skinId: string) => {
  return executeFunction('setHeroChoseSkin', heroId, skinId);
};
/**
 * export const checkCanAutoConfirm = (msg: string, delay = 3000) => {
 */
export const f_checkCanAutoConfirm = async (opt: ShowSliderConfirmType) => {
  return executeFunction('checkCanAutoConfirm', opt);
};
/**
 * export const openPath = (path_: string) => {
 */
export const f_openPath = async (path_: string) => {
  return executeFunction('openPath', path_);
};
/**
 * export const emptyPah = (path_: string) => {
 */
export const f_emptyPah = async (path_: string) => {
  return executeFunction('emptyPah', path_);
};
/**
 * export const confirmChoseSkin = async (msg: string, imageSrc: string) => {
 */
export const f_confirmChoseSkin = async (msg: string, imageSrc: string) => {
  return executeFunction('confirmChoseSkin', msg, imageSrc);
};
/**
 * export const showToast = async (msg: string) => {
 */
export const f_showToast = async (msg: string) => {
  return executeFunction('showToast', msg);
};
/**
 * export const removePath = (path_: string) => {
 */
export const f_removePath = async (path_: string) => {
  return executeFunction('removePath', path_);
};
/**
 * export const request_string_get = (url: string, suffix = FileType.TEXT): Promise<string> => {
 */
export const f_request_string_get = async (url: string): Promise<string> => {
  return executeFunction('request_string_get', url);
};
/**
 * export const requestHtmlByWindows = async (url: string) => {
 */
export const f_requestHtmlByWindows = async (url: string) => {
  return executeFunction('requestHtmlByWindows', url);
};
/**
 * export const winGetData = async (code: string, url: string, show = false) => {
 */
export const f_winGetData = async (code: string, url: string, show = false) => {
  return executeFunction('winGetData', code, url, show);
};
/**
 * export const openUrl = (url: string) => {
 */
export const f_openUrl = async (url: string) => {
  return executeFunction('openUrl', url);
};
/**
 * export const setConfig = (key: string, value: string) => {
 */
export const f_setConfig = async (key: string, value: string) => {
  return executeFunction('setConfig', key, value);
};
/**
 * export const selectPathOrFile = async (
 *   properties: 'openFile' | 'openDirectory' | 'all' = 'all',
 *   defaultPath: string
 * )
 */
export const f_selectPathOrFile = async (
  properties: 'openFile' | 'openDirectory' | 'all' = 'all',
  defaultPath: string
) => {
  return executeFunction('selectPathOrFile', properties, defaultPath);
};
/**
 * export const loadSkins = async () => {
 */
export const f_loadSkins = async () => {
  return executeFunction('loadSkins');
};
/**
 * export const getSkinImage = (skinId: string) => {
 */
export const f_getSkinImage = async (skinId: string) => {
  return executeFunction('getSkinImage', skinId);
};
/**
 * export const getAllLoadSkins = () => {
 */
export const f_getAllLoadSkins = async () => {
  return executeFunction('getAllLoadSkins');
};
/**
 * export const clearSkinImage = () => {
 */
export const f_clearSkinImage = async (skinId?: string) => {
  return executeFunction('clearSkinImage', skinId);
};
/**
 * export const mkOverlay = async (heroId: string, skinId: string, skinImage: string) => {
 */
export const f_mkOverlay = async (heroId: string, skinId: string, skinImage: string) => {
  return executeFunction('mkOverlay', heroId, skinId, skinImage);
};
/**
 * export const setIdName = (heroList: any[]) => {
 */
export const f_setIdName = async (heroList: any[]) => {
  return executeFunction('setIdName', heroList);
};
/**
 * export const loadSkinDataIdName = () => {
 */
export const f_loadSkinDataIdName = async (chuckSize = 20) => {
  return executeFunction('loadSkinDataIdName', chuckSize);
};
/**
 * export const loadSkinDataByFilePath = async (fullWadPath: string, current = -1) => {
 */
export const f_loadSkinDataByFilePath = async (fullWadPath: string, current = -1) => {
  return executeFunction('loadSkinDataByFilePath', fullWadPath, current);
};
/**
 * export const shoutDownModTools = async () => {
 */
export const f_shoutDownModTools = async () => {
  return executeFunction('shoutDownModTools');
};
/**
 * export const unpackWadFileTo = async (fullWadPath) => {
 */
export const f_unpackWadFileTo = async (fullWadPath) => {
  return executeFunction('unpackWadFileTo', fullWadPath);
};
/**
 * export const setIsUseCommand = (isUseCommand: boolean) => {
 */
export const f_setIsUseCommand = async (isUseCommand: boolean) => {
  return executeFunction('setIsUseCommand', isUseCommand);
};
