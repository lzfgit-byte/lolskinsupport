import { net } from 'electron';
import { formatSize, hashString } from '@ilzf/utils';
import { FileType } from '@ghs/types';
import { cache_exist, cache_get, cache_save } from '../utils';
import { MessageUtil, ProgressMsgUtil } from '../utils/message';

/**
 * 测试用
 * @param url
 * @param suffix
 */
export const request_string_get = (url: string, suffix = FileType.TEXT): Promise<string> => {
  return new Promise((resolve) => {
    if (cache_exist(url, suffix)) {
      const cache = cache_get(url, suffix);
      resolve(cache || '');
      return;
    }

    const request = net.request(url);

    let blob: any = Buffer.alloc(0);
    request.on('response', (response) => {
      const header = response.headers;
      response.on('data', (chunk) => {
        blob = Buffer.concat([blob, chunk], blob.length + chunk.length);
      });
      response.on('end', () => {
        resolve(cache_save(url, String(blob), suffix));
        blob = null;
      });
      response.on('error', () => {
        MessageUtil.error(`请求失败远程${url}`);
      });
    });
    request.on('error', () => {
      MessageUtil.error(`请求失败远程${url}`);
    });
    request.end();
  });
};

export const request_mp4_data = (url: string, suffix = FileType.VIDEO): Promise<any> => {
  return new Promise((resolve) => {
    const request = net.request(url);
    let blob: any = Buffer.alloc(0);
    request.on('response', (response) => {
      const header: any = response.headers;
      const length = header['content-length'];
      const filename = header.filename;
      response.on('data', (chunk) => {
        blob = Buffer.concat([blob, chunk], blob.length + chunk.length);
        ProgressMsgUtil.sendProgressMsg({
          title: `${formatSize(blob.length)}/${formatSize(length)}`,
          percentage: parseInt(((blob.length / length) * 100).toFixed(0)),
          key: hashString(url),
        });
      });
      response.on('end', () => {
        resolve(`data:video/mp4;base64,${Buffer.from(blob).toString('base64')}`);
        ProgressMsgUtil.close(hashString(url));
        blob = null;
      });
      response.on('error', () => {
        MessageUtil.error(`请求失败远程${url}`);
      });
    });
    request.on('error', () => {
      MessageUtil.error(`请求失败远程${url}`);
    });
    request.end();
  });
};
