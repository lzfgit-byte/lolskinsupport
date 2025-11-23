import type {
  BaseConfig,
  CComic,
  CContent,
  DetailInfo,
  Item,
  Page,
  UrlReplace,
  WebConfig,
} from '@ghs/types';
import { isFalsity } from '@ilzf/utils';

import type { ComicHistory } from '@ghs/constant';
import { MessageUtil } from '../utils/message';
import {
  getBaseConfigByKey,
  getCurrentKey,
  getWebConfigAry,
  getWebConfigByKey,
  setCurrentKey,
} from '../business/use-init-web-config';
import { getCurrentBusiness } from '../business/business';
// 搜索
export * from './search';
// 基础
export * from './base';
// 收藏
export * from './collect';
// 历史
export * from './history';
//
export * from './web-config';
export * from './system-comfig';
export * from './series';

export * from '../plugins';
/**
 *获取所有的配置项
 */
export const listAllWebConfigs = async (): Promise<WebConfig[]> => {
  return getWebConfigAry();
};
/**
 *获取当前的key
 */
export const getCurrentKeyExp = async (): Promise<string> => {
  return getCurrentKey();
};
/**
 * 设置当前的key
 */
export const setCurrentKeyExp = async (key: string) => {
  setCurrentKey(key);
};
/**
 * 获取当前的config
 */
export const getCurrentWebConfig = async (key: string): Promise<BaseConfig> => {
  return getBaseConfigByKey(key);
};
/**
 * 获取主页基本信息
 * @param key
 */
export const getPage = async (key: string): Promise<Page> => {
  if (isFalsity(key)) {
    MessageUtil.error('获取页面的key 不能为空');
    return null;
  }
  setCurrentKey(key);
  const business = getCurrentBusiness(key);
  return business.getPage();
};
/**
 * 根据url 加载页面
 * @param url
 */
export const loadPage = async (url: string): Promise<Page> => {
  const business = getCurrentBusiness(getCurrentKey());
  return business.getPage(url);
};

/**
 * 获取detail
 */
export const getDetailPage = async (item: Item): Promise<DetailInfo> => {
  const business = getCurrentBusiness(getCurrentKey());
  return business.getDetailPage(item);
};
/**
 * 处理排序
 */
export const adapterLoadUrl = (url: string, urlReplaces: UrlReplace[]) => {
  const wc = getWebConfigByKey(getCurrentKey());
  return wc.adapterLoadUrl(url, urlReplaces);
};
/**
 * 获取目录
 */
export const getContent = (url: string): Promise<CContent[]> => {
  const business = getCurrentBusiness(getCurrentKey());
  return business.getContents(url);
};
/**
 * 获取漫画图片
 */
export const getComicIImages = (url: string): Promise<CComic[]> => {
  const business = getCurrentBusiness(getCurrentKey());
  return business.getComicImages(url);
};
/**
 * 获取当前的目录url
 */
export const getCurrentContentUrl = (): Promise<ComicHistory> => {
  const business = getCurrentBusiness(getCurrentKey());
  return business.getComicCurrentContent();
};
/**
 * 获取当前的目录url
 */
export const updateCurrentComic = (per: number) => {
  const business = getCurrentBusiness(getCurrentKey());
  business.updateCurrentComic(per).then(() => 1);
};
/**
 *清楚当前的url
 */
export const clearCurrentUrl = async () => {
  const business = getCurrentBusiness(getCurrentKey());
  await business.clearCurrentUrl();
};
