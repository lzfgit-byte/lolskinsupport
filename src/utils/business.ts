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
export const f_loadSkin = async (heroId: string, skinId: string) => {
  return executeFunction('loadSkin', heroId, skinId);
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
export const f_checkCanAutoConfirm = async (msg: string, delay = 3000) => {
  return executeFunction('checkCanAutoConfirm', msg, delay);
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
 * export const getLcuState = () => {
 */
export const f_getLcuState = async () => {
  return executeFunction('getLcuState');
};
