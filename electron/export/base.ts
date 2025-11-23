import { readFileSync, statSync } from 'node:fs';

import { existsSync } from 'fs-extra';
import { hashString } from '@ilzf/utils';
import { CollectEntity, IS_CAN_CONTINUE, SERVER_PORT } from '@ghs/constant';
import type { Detail, Item } from '@ghs/types';
import { FileType } from '@ghs/types';
import {
  getImgBase64ByWin,
  requestHtml,
  requestHtmlByWin,
  requestImage,
  request_string_get,
  win_get_data,
  win_open,
} from '../http';
import { LogMsgUtil, MessageUtil, NotifyMsgUtil } from '../utils/message';
import { app_set_config_dir } from '../const/app-paths';
import { eventEmitter, getLocalIPs } from '../utils/KitUtil';
import { cache_clean } from '../utils';

/**
 * 获取html
 * @param url
 */
export const getHtml = async (url: string) => {
  let html = (await requestHtml(url)) as any;
  if (!IS_CAN_CONTINUE(html)) {
    LogMsgUtil.sendLogMsg('request 失败，使用win');
    cache_clean(url, FileType.HTML);
    html = await requestHtmlByWin(url);
  }
  return html;
};
/**
 * 获取html
 * @param url
 */
export const getHtmlWithProcess = async (url: string) => {
  const key = hashString(url);
  const handle = (msg) => {
    NotifyMsgUtil.sendNotifyMsg('进度', `开始获取html:${msg}`, key);
  };
  eventEmitter.on(key, handle);
  let html = (await requestHtml(url)) as any;
  NotifyMsgUtil.close(key);
  eventEmitter.off(key, handle);

  if (!IS_CAN_CONTINUE(html)) {
    LogMsgUtil.sendLogMsg('request 失败，使用win');
    cache_clean(url, FileType.HTML);
    html = await requestHtmlByWin(url);
  }
  return html;
};
/**
 * 获取图片
 * @param url
 */
export const getImage = async (url: string) => {
  if (url.startsWith('data:')) {
    return url;
  }
  let str = (await requestImage(url)) as any;
  if (str.indexOf('Just a moment...') > 0 || str === '') {
    cache_clean(url, FileType.IMAGE);
    str = await getImgBase64ByWin(url);
  }
  return str;
};

/**
 * 使用新窗口获取数据
 * @param url
 */
export const winGetDataCode = async (code: string, url: string): Promise<any> => {
  return win_get_data(code, url);
};
/**
 * 使用新窗口打开
 */
export const winOpenAny = async (url: string, code: string, width: number, height: number) => {
  win_open(url, code, width, height);
};

/**
 *获取远程data的string格式
 */
export const getDataString = async (url: string): Promise<string> => {
  return request_string_get(url);
};
/**
 * 设置db路径
 * @param path
 */
export const app_set_db_dir = (path: string): boolean => {
  const state = statSync(path);
  if (existsSync(path) && state.isFile() && path.endsWith('.db')) {
    app_set_config_dir(path);
    return true;
  }
  return false;
};

/**
 * 收藏导入
 */
export const importFavorite = async (path: string) => {
  const importData = readFileSync(path, { encoding: 'utf-8' });
  const dataS: { RECORDS: any[] } = JSON.parse(importData);
  for (const item_ of dataS?.RECORDS?.map((item) => ({ value: item.value, type: item.type }))) {
    const item = JSON.parse(item_.value);
    const type = item_.type;
    const isVideo = item.flatTags.some((item: any) => item.title.toUpperCase() === 'VIDEO');
    const detail: Item = {
      ...item,
      renderType: 'normal',
      tags: item.flatTags,
      type: isVideo ? 'video' : 'image',
    } as any;
    const one = await CollectEntity.findOne({ where: { type: detail.type, url: detail.jumpUrl } });
    if (one) {
      continue;
    }
    const ent = new CollectEntity();
    ent.url = detail.jumpUrl;
    ent.type = type;
    ent.value = JSON.stringify(detail);
    ent.count = 0;
    await ent.save();
  }
};
/**
 * 收藏导出
 */
export const exportFavorite = async (path: string) => {};

/**
 * 获取服务地址
 */
export const getServers = async (): Promise<string[]> => {
  const ips = getLocalIPs();
  return ips.map((ip) => `http://${ip}:${SERVER_PORT}/index`);
};
/**
 * 执行js
 * @param url
 * @param code
 */
export const executeJs = async (url: string, code: string, show = false) => {
  return win_get_data(code, url, show);
};
