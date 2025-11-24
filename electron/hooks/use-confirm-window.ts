import path from 'node:path';
import { clearTimeout } from 'node:timers';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { MessageUtil } from '../utils/message';
import { confirmHtml } from './export-confirm-html';
let htmlContent = confirmHtml;
export const showConfirmWindow = () => {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  let targetWidth = 300;
  let targetHeight = 100;
  let targetY = 30;

  // 初始宽度设为 0，实现动画效果
  let win: BrowserWindow = new BrowserWindow({
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

  win.once('ready-to-show', () => {
    win.show();
    // 动画：逐步展开窗口
    let c = 0;
    let animation = setInterval(() => {
      if (c > targetWidth + 20) {
        clearTimeout(animation);
        return;
      }
      win.setBounds({
        x: screenWidth - c++,
        y: targetY,
        width: targetWidth,
        height: targetHeight,
      });
    });
  });

  ipcMain.on('confirm-confirm', () => {
    win.close();
  });
  ipcMain.on('confirm-cancel', () => {
    win.close();
  });
};
