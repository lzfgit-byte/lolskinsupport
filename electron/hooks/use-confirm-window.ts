import path from 'node:path';
import { clearTimeout } from 'node:timers';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { executeFunc } from '@ilzf/utils';
import { MessageUtil } from '../utils/message';
import { confirmHtml } from './export-confirm-html';
let htmlContent = confirmHtml;
let showCount = 0;
export const showSliderConfirm = (msg: string, okFunc?: any, cFunc?: any, delay = 3000) => {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const hashId = Date.now().toString();
  let targetWidth = 300;
  let targetHeight = 100;
  let targetY = 30 + showCount++ * 120;

  // 初始宽度设为 0，实现动画效果
  let win = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    x: screenWidth, // 从屏幕最右边开始
    y: targetY,
    show: false,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  const strReplaceAll = (str: string, find: string, replace: string) => {
    while (str.indexOf(find) > -1) {
      str = str.replace(find, replace);
    }
    return str;
  };
  const base64Html = Buffer.from(
    strReplaceAll(htmlContent, '$hashId', hashId)
      .replace('$message', msg)
      .replace('$delay', `${delay}`)
  ).toString('base64');
  win.loadURL(`data:text/html;base64,${base64Html}`);

  const toShow = (flag: boolean, cb: any) => {
    const targetX = screenWidth - targetWidth - 20;
    let x = flag ? screenWidth : targetX;
    const step = 24; // 步长：可调，越大越快但更“跳”
    const fpsInterval = 16; // ~60 FPS
    const anim = setInterval(() => {
      if (flag) {
        x -= step;
        if (x <= targetX) {
          win.setPosition(targetX, targetY);
          clearInterval(anim); // 注意 clearInterval
          return;
        }
        win.setPosition(Math.round(x), targetY);
        return;
      }
      x += step;
      if (x >= screenWidth + 20) {
        clearInterval(anim);
        win.close();
        win = null;
        cb && cb();
        return;
      }
      win.setPosition(Math.round(x), targetY);
    }, fpsInterval);
  };

  win.once('ready-to-show', () => {
    win.show();
    toShow(true, null);
  });
  const cancelFunc = () => {
    toShow(false, null);
    ipcMain.off(`${hashId}-confirm-cancel`, cancelFunc);
    ipcMain.off(`${hashId}-confirm-confirm`, confirmFunc);
    showCount--;
    executeFunc(cFunc);
  };
  const confirmFunc = () => {
    toShow(false, null);
    ipcMain.off(`${hashId}-confirm-confirm`, confirmFunc);
    ipcMain.off(`${hashId}-confirm-cancel`, cancelFunc);
    showCount--;
    executeFunc(okFunc);
  };
  ipcMain.on(`${hashId}-confirm-confirm`, confirmFunc);
  ipcMain.on(`${hashId}-confirm-cancel`, cancelFunc);
};
