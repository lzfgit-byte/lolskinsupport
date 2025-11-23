import { BrowserWindow, globalShortcut } from 'electron';

import { SHORTCUTS } from '@ghs/constant';

export default (win: BrowserWindow) => {
  globalShortcut.register(SHORTCUTS.OPEN_DEV_TOOLS, function () {
    let win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.openDevTools();
    }
  });
};
