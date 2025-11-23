import type { BaseConfig, WebConfig } from '@ghs/types';
import type { Cheerio } from 'cheerio/lib/cheerio';
import type { Element } from 'domhandler';
import { keys } from 'lodash';
import { base64ToStr, hashString, isFunction } from '@ilzf/utils';

import { ElementAttr, ElementTypes, WebConfigEntity, breakStr } from '@ghs/constant';
import { net } from 'electron';
import { executeJs, getHtml, getHtmlWithProcess, listWebConfig } from '../export';
import { ConsoleLogUtil, LogMsgUtil, MessageUtil, NotifyMsgUtil } from '../utils/message';
import { eventEmitter, getCurrentItems, helpElAttr, helpElText } from '../utils/KitUtil';
import { request_string_get } from '../http';
// @ts-ignore
import staticCode from './static-code?raw';
import { resetCurrentBusiness } from './business';

let currentKey = '';
export const setCurrentKey = (key: string) => {
  currentKey = key;
};
export const getCurrentKey = () => currentKey;

const cache: Record<string, WebConfig> = {};
const staticBreak = '//* **';
const wrapperCode = (code: string) => {
  const codes = code.split(breakStr);
  if (codes.length === 2) {
    let replace = codes[1].substring(0, codes[1].lastIndexOf(';'));
    return staticCode
      .replaceAll(staticBreak, '')
      .replace(`'$code'`, replace.replace(': any', '').replace(': Item[]', ''));
  }
};
export const getWebConfigByKey = (key: string) => {
  return cache[key];
};
export const getBaseConfigByKey = (key: string): BaseConfig => {
  const wc = cache[key];
  const foo: WebConfig = {} as any;
  keys(wc).forEach((cKey) => {
    if (!isFunction(wc[cKey])) {
      foo[cKey] = wc[cKey];
    }
  });
  return foo;
};
export const getWebConfigAry = (): WebConfig[] => {
  const res: WebConfig[] = [];
  keys(cache).forEach((key) => {
    const wc = cache[key];
    const foo: WebConfig = {} as any;
    keys(wc).forEach((cKey) => {
      if (!isFunction(wc[cKey])) {
        foo[cKey] = wc[cKey];
      }
    });
    res.push(foo);
  });
  return res;
};
export const parseWebConfig = (code: string) => {
  const config: WebConfig = new Function(wrapperCode(code))()(
    helpElAttr,
    helpElText,
    ElementAttr,
    ElementTypes,
    getHtml,
    NotifyMsgUtil,
    LogMsgUtil,
    hashString,
    eventEmitter,
    request_string_get,
    getCurrentItems,
    MessageUtil,
    getHtmlWithProcess,
    ConsoleLogUtil,
    net,
    executeJs
  );
  return config;
};
export const loadWebConfig = async () => {
  const list = await listWebConfig();
  const configs = list.map((item) => base64ToStr(item.code));
  configs.forEach((item) => {
    const config = parseWebConfig(item);
    cache[config.key] = config;
    if (!getCurrentKey()) {
      setCurrentKey(config.key);
    }
  });
};
export const resetWebConfig = async (key: string) => {
  const ent = await WebConfigEntity.findOne({ where: { key } });
  cache[key] = parseWebConfig(base64ToStr(ent.code));
  resetCurrentBusiness(key);
};
export default () => {
  loadWebConfig().then(() => 1);
};
