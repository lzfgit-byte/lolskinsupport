import { BrowserWindow, globalShortcut, ipcMain } from 'electron';
import { hashString } from '@ilzf/utils';
import { MESSAGE_EVENT_KEY, SHORTCUTS, USE_CHILD_WIN_EVENT } from '@ghs/constant';
import { FileType } from '@ghs/types';
import useProxySetting from '../setting/use-proxy-setting';
import { getMainWin } from '../main';
import { MessageUtil, NotifyMsgUtil } from '../utils/message';
import { resolvePreload } from '../utils/KitUtil';
import { cache_get, cache_save } from '../utils';

const preHtmlDownload = resolvePreload('execute-js');
/**
 * 使用新窗口获取数据，执行外部传入code，执行完毕后关闭
 * @param code
 * @param url
 */
export const win_get_data = (code: string, url: string, show = false): Promise<any> => {
  if (!code || !url) {
    MessageUtil.info('没有执行代码');
    return;
  }
  const html = cache_get(url, FileType.HTML);
  if (html) {
    return Promise.resolve(html);
  }
  const key = hashString(url);
  NotifyMsgUtil.sendNotifyMsg('executeJs', '开始', key);
  const pw = getMainWin();
  const win = new BrowserWindow({
    width: 1450,
    height: 788,
    show,
    parent: pw,
    title: url,
    webPreferences: {
      preload: preHtmlDownload,
      nodeIntegration: false,
      contextIsolation: false,
    },
  });
  useProxySetting(win);

  const webContents = win.webContents;
  if (show) {
    webContents.openDevTools();
  }
  globalShortcut.unregister(SHORTCUTS.OPEN_JS_WIN);
  globalShortcut.register(SHORTCUTS.OPEN_JS_WIN, () => {
    win?.show();
  });

  return new Promise((resolve) => {
    const keyEvt = 'executeJsInElectron';
    NotifyMsgUtil.sendNotifyMsg(keyEvt, '进入promise', key);
    const l = (se, arg) => {
      NotifyMsgUtil.sendNotifyMsg(keyEvt, arg, key);
    };
    ipcMain.removeHandler(MESSAGE_EVENT_KEY.SEND_EXECUTE_JS_MESSAGE);
    ipcMain.handle(MESSAGE_EVENT_KEY.SEND_EXECUTE_JS_MESSAGE, l);

    ipcMain.removeHandler(USE_CHILD_WIN_EVENT.JS_SHOW_WIN);
    ipcMain.handle(USE_CHILD_WIN_EVENT.JS_SHOW_WIN, () => {
      win?.show();
    });
    ipcMain.removeHandler(USE_CHILD_WIN_EVENT.JS_HIDE_WIN);
    ipcMain.handle(USE_CHILD_WIN_EVENT.JS_HIDE_WIN, () => {
      win?.hide();
    });

    const func = (se: any, html: string) => {
      NotifyMsgUtil.sendNotifyMsg(keyEvt, '开始执行', key);
      webContents
        .executeJavaScript(code)
        .then((res: string) => {
          if (res) {
            cache_save(url, res, FileType.HTML);
            resolve(res);
            if (!show) {
              win?.destroy();
              globalShortcut.unregister(SHORTCUTS.OPEN_JS_WIN);
            }
          }
        })
        .catch((reason) => {
          NotifyMsgUtil.sendNotifyMsg(keyEvt, reason.toString(), key);
          win.show();
        })
        .finally(() => {
          // webContents.off('did-finish-load', listener);
          // win?.destroy();
          NotifyMsgUtil.close(key);
        });
    };
    ipcMain.removeHandler(USE_CHILD_WIN_EVENT.JS_SEND_HTML);
    ipcMain.handle(USE_CHILD_WIN_EVENT.JS_SEND_HTML, func);
    NotifyMsgUtil.sendNotifyMsg(keyEvt, '加载url', key);
    win.loadURL(url);
    // const listener = () => {
    //   NotifyMsgUtil.sendNotifyMsg(keyEvt, '开始执行', key);
    //   webContents
    //     .executeJavaScript(code)
    //     .then((res: string) => {
    //       if (res) {
    //         resolve(res);
    //         if (!show) {
    //           win?.destroy();
    //           globalShortcut.unregister(SHORTCUTS.OPEN_JS_WIN);
    //         }
    //       }
    //     })
    //     .catch((reason) => {
    //       NotifyMsgUtil.sendNotifyMsg(keyEvt, reason.toString(), key);
    //       win.show();
    //     })
    //     .finally(() => {
    //       // webContents.off('did-finish-load', listener);
    //       // win?.destroy();
    //       NotifyMsgUtil.close(key);
    //     });
    // };
    // webContents.on('dom-ready', listener);
  });
};

/**
 * 打开新窗口，并执行相应的代码。不会关闭
 */

export const win_open = (url: string, code = '', width = 1200, height = 800) => {
  if (!url) {
    return;
  }
  const winW = getMainWin();
  const win = new BrowserWindow({
    width,
    height,
    parent: winW,
    show: true,
    modal: true,
    title: url,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  useProxySetting(win);
  const webContents = win.webContents;
  const listener = () => {
    webContents
      .executeJavaScript(code)
      .then((res: string) => {})
      .catch((reason) => {})
      .finally(() => {
        webContents.off('dom-ready', listener);
      });
  };
  if (code) {
    webContents.on('dom-ready', listener);
  }
  win.loadURL(url);
};
