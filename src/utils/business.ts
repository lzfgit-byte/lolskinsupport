import { getSkinPath } from '../../electron/export';
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
export const f_loadSkin = async (...args: string[]) => {
  return executeFunction('loadSkin', ...args);
};
