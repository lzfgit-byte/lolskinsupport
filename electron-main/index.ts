// @ts-ignore
import path from 'path';
import { app, BrowserWindow, Menu } from 'electron';

let win: BrowserWindow;

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1150,
    height: 740,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      preload: path.join(__dirname, '../electron-preload/index.js'),
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', '主进程发送消息了');
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../index.html'));
  } else {
    // 🚧 Use ['ENV_NAME'] avoid vite:define plugin
    const url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}`;
    win.loadURL(url);
    win.webContents.openDevTools();
  }
}

app.on('window-all-closed', () => {
  win = null;
});

app.whenReady().then(createWindow);
