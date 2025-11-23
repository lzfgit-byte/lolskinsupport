import type { Request, Response } from 'express-serve-static-core';

export const getQueryData = <T>(req: Request): T => {
  return req?.query as T;
};
export const setDefaultHeader = (res: Response) => {
  res.setHeader('Content-Type', 'application/json');
};

export class ResultUtil {
  static success(data: any) {
    return {
      code: 200,
      data,
    };
  }

  static error(message: string) {
    return {
      code: 500,
      message,
    };
  }
}
export const allowedHeaders = [
  'accept-ranges',
  'access-control-allow-origin',
  'cache-control',
  'content-length',
  'content-type',
  'date',
  'last-modified',
  'server',
  'x-77-cache',
  'x-77-nzt',
  'x-77-nzt-ray',
  'x-accel-expires',
  'x-cache',
  'x-content-type-options',
  'x-frame-options',
  'x-xss-protection',
  'age',
  'cf-cache-status',
  'cf-ray',
  'content-range',
  'etag',
  'nel',
  'pragma',
  'report-to',
  'vary',
  'x-powered-by',
];

export const allowedRequestHeaders = [
  'connection',
  'pragma',
  'cache-control',
  'user-agent',
  'accept-encoding',
  'accept',
  'accept-language',
  'cookie',
  'range',
];
