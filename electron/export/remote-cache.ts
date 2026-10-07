import { cache_clean, cache_exist, cache_get, cache_save } from '../utils/cache';

/**
 * 远程接口数据缓存
 * 用于网络请求失败时回退到上一次成功请求的结果，避免页面因断网而空白
 */
const REMOTE_CACHE_SUFFIX = 'remote';

/**
 * 保存远程接口返回的数据（字符串）
 * @param key 缓存标识，例如 hero_skins_1
 * @param text 序列化后的数据
 */
export const saveRemoteCache = (key: string, text: string): string => {
  return cache_save(key, text, REMOTE_CACHE_SUFFIX);
};

/**
 * 读取远程接口缓存，未命中返回空字符串
 * @param key 缓存标识
 */
export const readRemoteCache = (key: string): string => {
  const data = cache_get(key, REMOTE_CACHE_SUFFIX);
  return typeof data === 'string' ? data : '';
};

/**
 * 判断远程接口缓存是否存在
 * @param key 缓存标识
 */
export const hasRemoteCache = (key: string): boolean => {
  return cache_exist(key, REMOTE_CACHE_SUFFIX);
};

/**
 * 清理某个远程接口缓存
 * @param key 缓存标识
 */
export const clearRemoteCache = (key: string): boolean => {
  if (!key) {
    return false;
  }
  cache_clean(key, REMOTE_CACHE_SUFFIX);
  return true;
};
