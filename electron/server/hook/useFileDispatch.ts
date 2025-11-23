import { join } from 'node:path';
import fs, { readFileSync } from 'node:fs';
import type { Request, Response } from 'express-serve-static-core';
import useVideoProxy from './useVideoProxy';

export default async (route: string, req: Request, res: Response) => {
  if (route === '/index') {
    const indexHtml = join(process.env.DIST, 'h5/index.html');
    const html = readFileSync(indexHtml, 'utf-8');
    return res.end(html);
  }
  if (route === '*') {
    if (req.url.indexOf('.ts') > -1 || req.url.indexOf('.m3u8') > -1) {
      await useVideoProxy(route, req, res);
      return;
    }

    const filePath = join(`${process.env.DIST}`, 'h5', req.url);
    if (filePath.indexOf('.js') > -1) {
      res.setHeader('Content-Type', 'text/javascript');
    }
    if (filePath.indexOf('.css') > -1) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (fs.existsSync(filePath)) {
      const fileData = readFileSync(filePath, 'utf-8');
      res.end(fileData);
    } else {
      res.end(filePath);
    }
  }
};
