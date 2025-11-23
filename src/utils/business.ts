import {executeFunction} from '@/utils/ipc';

/**
 * 获取图片
 * @param url
 */
export const f_getHtml = async (url: string): Promise<string> => {
  return executeFunction('getHtml', url);
};
