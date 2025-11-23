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
