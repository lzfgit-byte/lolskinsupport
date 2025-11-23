import type { Request, Response } from 'express-serve-static-core';
import { net } from 'electron';
import { allowedHeaders, allowedRequestHeaders, getQueryData } from '../utils/ServerUtil';
let baseM3u8Url = '';
export default async (route: string, req: Request, res: Response) => {
  // 发送请求到源视频流
  const queryData = getQueryData<{ url: string }>(req);
  let loadUrl = queryData.url;
  if (queryData?.url?.indexOf('m3u8') > -1) {
    baseM3u8Url = queryData.url;
  }

  if (
    (req?.url?.indexOf('.ts') > -1 || req?.url?.indexOf('.m3u8') > -1) &&
    baseM3u8Url &&
    !queryData?.url
  ) {
    let url = baseM3u8Url.substring(0, baseM3u8Url.lastIndexOf('/'));
    loadUrl = `${url}/${req.url}`;
  }
  if (!loadUrl) {
    res.end('地址未传入');
    return;
  }
  const request = net.request(loadUrl);
  req.on('close', () => {
    request.abort();
  });

  allowedRequestHeaders.forEach((key) => {
    if (req.headers[key]) {
      request.setHeader(key, req.headers[key] as string);
    }
  });

  request.on('response', (response) => {
    // 设置响应头
    // res.writeHead(response.statusCode, response.headers);
    res.status(response.statusCode);
    allowedHeaders.forEach((key) => {
      if (response.headers[key]) {
        res.setHeader(key, response.headers[key]);
      }
    });

    // 管道响应数据
    response.on('data', (chunk) => {
      res.write(chunk);
    });
    response.on('end', () => {
      res.end();
    });
  });

  request.on('error', (error) => {
    console.error('请求出错:', error);
    res.status(500).send('Internal Server Error');
  });

  request.end();
};
