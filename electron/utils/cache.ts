import path from 'node:path';
import { statSync, unlinkSync } from 'node:fs';

import {
  emptyDirSync,
  ensureFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs-extra';
import { formatSize, hashString, isFalsity } from '@ilzf/utils';
import { APP_PATHS } from '../const/app-paths';
import { MessageUtil } from './message';

const CACHE_PATH = APP_PATHS.cache_path;

export const buildCacheFilePath = (fileName: string, suffix = 'temp') => {
  return `${CACHE_PATH}\\${suffix}\\${hashString(fileName)}`;
};
/**
 *判断是否缓存是否存在
 * @param fileName
 * @param suffix
 */
export const cache_exist = (fileName: string, suffix = '') => {
  return existsSync(buildCacheFilePath(fileName, suffix));
};
/**
 *保存缓存，字符串
 * @param fileName
 * @param data
 * @param suffix
 */
export const cache_save = (fileName: string, data: any, suffix = ''): string => {
  ensureFileSync(buildCacheFilePath(fileName, suffix));
  writeFileSync(buildCacheFilePath(fileName, suffix), data, { encoding: 'utf-8' });
  return data;
};
/**
 *获取缓存,字符串
 * @param fileName
 * @param suffix
 */
export const cache_get = (fileName: string, suffix = '') => {
  if (cache_exist(fileName, suffix)) {
    return readFileSync(buildCacheFilePath(fileName, suffix), { encoding: 'utf-8' });
  }
  return false;
};
/**
 *保存缓存字节 byte
 * @param fileName
 * @param data
 * @param suffix
 */
export const cache_byte_save = (fileName: string, data: any, suffix = ''): any => {
  writeFileSync(buildCacheFilePath(fileName, suffix), data);
  return data;
};
/**
 *获取缓存 byte
 * @param fileName
 * @param suffix
 */
export const cache_byte_get = (fileName: string, suffix = '') => {
  if (cache_exist(fileName, suffix)) {
    return readFileSync(buildCacheFilePath(fileName, suffix));
  }
  return false;
};
/**
 *清理缓存 删除特定名字的缓存
 * @param fileName
 * @param suffix
 */
export const cache_clean = (fileName?: string, suffix?: string) => {
  if (isFalsity(fileName)) {
    emptyDirSync(CACHE_PATH);
    return;
  }
  if (cache_exist(fileName, suffix)) {
    unlinkSync(buildCacheFilePath(fileName, suffix));
  }
};
/**
 * 根据特定后缀去删除文件
 * @param fileSuffix
 */
export const cache_suffix_clean = (fileSuffix?: any) => {
  if (!fileSuffix) {
    emptyDirSync(CACHE_PATH);
    MessageUtil.success('清除了全部缓存');
    return;
  }
  emptyDirSync(`${CACHE_PATH}\\${fileSuffix}`);
  MessageUtil.success(`清除了缓存-->${fileSuffix}`);
};
export const cache_dir_size = () => {
  function calculateDirectorySize(directoryPath: string) {
    let size = 0;
    // 读取目录中的所有文件和目录
    readdirSync(directoryPath).forEach((file) => {
      const fullPath = path.join(directoryPath, file);
      // 检查当前文件是文件还是目录
      if (statSync(fullPath).isDirectory()) {
        // 如果是目录，则递归调用函数
        size += calculateDirectorySize(fullPath);
      } else {
        // 如果是文件，则累加文件大小
        size += statSync(fullPath).size;
      }
    });
    return size;
  }
  return formatSize(calculateDirectorySize(CACHE_PATH));
};
export const cache_dir_db = () => APP_PATHS.db_path;
