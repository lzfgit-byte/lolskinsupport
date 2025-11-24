import path from 'node:path';
import { clearTimeout } from 'node:timers';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { MessageUtil } from '../utils/message';
import { confirmHtml } from './export-confirm-html';
let htmlContent = confirmHtml;
let win: BrowserWindow;
export const showConfirmWindow = () => {
  if (win != null) {
    return;
  }
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  let targetWidth = 300;
  let targetHeight = 100;
  let targetY = 30;

  // 初始宽度设为 0，实现动画效果
  win = new BrowserWindow({
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

  const base64Html = Buffer.from(htmlContent.replace('$message', '时间结束自动应用')).toString(
    'base64'
  );
  win.loadURL(`data:text/html;base64,${base64Html}`);

  const toShow = (flag: boolean) => {
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
        return;
      }
      win.setPosition(Math.round(x), targetY);
    }, fpsInterval);
  };

  win.once('ready-to-show', () => {
    win.show();
    toShow(true);
  });
  ipcMain.on('confirm-confirm', () => {
    toShow(false);
  });
  ipcMain.on('confirm-cancel', () => {
    toShow(false);
  });
};
