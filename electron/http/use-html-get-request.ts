import { net } from 'electron';
import { calcProcess, formatSize, hashString, isFalsity } from '@ilzf/utils';
import { FileType } from '@ghs/types';
import { LogMsgUtil, MessageUtil, ProgressMsgUtil } from '../utils/message';
import { cache_exist, cache_get, cache_save } from '../utils';
import { eventEmitter } from '../utils/KitUtil';
const requestFunc = (url: string, suffix: string, apply: (data: any) => any) => {
  const progressKey = hashString(url);
  return new Promise((resolve) => {
    if (cache_exist(url, suffix)) {
      const cache = cache_get(url, suffix);
      resolve(cache || '');
      return;
    }

    const request = net.request(url);

    let blob: any = Buffer.alloc(0);
    ProgressMsgUtil.sendProgress(0, progressKey);
    eventEmitter.emit(progressKey, 0);
    request.on('response', (response) => {
      const header = response.headers;
      let fileSize = +header['content-length'];
      response.on('data', (chunk) => {
        blob = Buffer.concat([blob, chunk], blob.length + chunk.length);
        const format = `${formatSize(blob.length)}/${fileSize ? formatSize(fileSize) : '未知'}`;

        ProgressMsgUtil.sendProgress(calcProcess(blob.length, fileSize), progressKey, format);
        eventEmitter.emit(progressKey, format);
      });
      response.on('end', () => {
        resolve(cache_save(url, apply(blob), suffix));
        ProgressMsgUtil.close(progressKey);
        blob = null;
      });
      response.on('error', () => {
        LogMsgUtil.sendLogMsg(`请求失败远程${url}`);
        resolve('aaaaJust a moment...');
      });
    });
    request.on('error', () => {
      resolve('ssssJust a moment...');
      LogMsgUtil.sendLogMsg(`请求失败远程${url}`);
    });
    request.end();
  });
};

/**
 *使用electron的net获取html
 * @param url
 */
export const requestHtml = (url: string) => {
  if (isFalsity(url)) {
    return;
  }
  return requestFunc(url, FileType.HTML, (blob) => String(blob));
};

/**
 * 使用electron的net获取图片base64
 * @param url
 */
export const requestImage = async (url: string) => {
  if (isFalsity(url)) {
    return;
  }
  return requestFunc(url, FileType.IMAGE, (blob) => {
    if (blob) {
      if (blob?.length < 100) {
        MessageUtil.warning(`【img】 获取图片长度不足100 ${url} `);
        return '';
      }
      const str = Buffer.from(blob).toString('utf8');
      if (str.indexOf('Just a moment...') > -1) {
        return '';
      }
      return `data:image/png;base64,${Buffer.from(blob).toString('base64')}`;
    } else {
      MessageUtil.warning(`【img】获取图片失败 ${url} `);
      return '';
    }
  });
};
