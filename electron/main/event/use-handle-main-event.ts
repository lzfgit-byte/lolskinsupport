import type { BrowserWindow } from 'electron';
import { shell } from 'electron';

export default (win: BrowserWindow) => {
  win.webContents.on('did-finish-load', () => {
    // sendMessage('start done');
  });
  win.webContents.on('destroyed', () => {});
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
};
