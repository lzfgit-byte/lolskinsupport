import { BrowserWindow } from 'electron';
import { isFalsity } from '@ilzf/utils';
import { FileType } from '@ghs/types';
import { cache_exist, cache_get, cache_save } from '../utils';
import useProxySetting from '../setting/use-proxy-setting';
import useSystemSetting from '../setting/use-system-setting';
import { logger } from '../utils/logger';
import { LogMsgUtil } from '../utils/message';
// @ts-ignore
import code from './img-windows-code?raw';
let parentWin: BrowserWindow;

const childWinds: { win: BrowserWindow; free: boolean }[] = [];
const getWinIndex = (win: BrowserWindow) => childWinds.findIndex((item) => item.win.id === win.id);
/**
 *切换标志位
 * @param win
 * @param flag
 */
const toggleWinStatus = (win: BrowserWindow, flag: boolean) => {
  const index = getWinIndex(win);
  if (index >= 0) {
    childWinds[index].free = flag;
  }
};
// 创建一个新的Win
const createNewWin = async () => {
  const sChildWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    parent: parentWin,
    title: 'picWindow',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  childWinds.push({ win: sChildWindow, free: false });
  LogMsgUtil.sendLogMsg('new', `${sChildWindow.id}`, `${childWinds.length}`);
  useProxySetting(sChildWindow);
  return sChildWindow;
};
const getAFreeWin = async (): Promise<BrowserWindow> => {
  const index = childWinds.findIndex((item) => item.free);
  if (index > -1) {
    childWinds[index].free = false;
    return childWinds[index].win;
  }
  const { imgWinMax } = await useSystemSetting();
  if (childWinds.length > imgWinMax) {
    LogMsgUtil.sendLogMsg('创建的窗口超限制了，等待其他资源释放');
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const index = childWinds.findIndex((item) => item.free);
        if (index > -1) {
          childWinds[index].free = false;
          resolve(childWinds[index].win);
          clearInterval(timer);
        }
      }, 200);
    });
  }
  return createNewWin();
};
let alwaysSend = 0;
const timer = setInterval(async () => {
  const { imgWinMin } = await useSystemSetting();
  if (childWinds.length > 0) {
    if (alwaysSend !== childWinds.length) {
      LogMsgUtil.sendLogMsg('现在运行的子窗口的数量是:', `${childWinds.length}`);
      alwaysSend = childWinds.length;
    }

    for (let i = childWinds.length - 1; i > imgWinMin; i--) {
      if (childWinds[i].free) {
        childWinds[i].win.close();
        logger.log(`释放了一个后台窗口，现在长度是:${childWinds.length}`);
        childWinds.splice(i, 1);
        break;
      }
    }
  }
}, 5000);

/**
 *根据传入的url 获取其中图片的base64代码
 * @param url
 */
export const getImgBase64ByWin = async (url: string): Promise<string> => {
  if (isFalsity(url)) {
    return;
  }
  if (cache_exist(url, FileType.IMAGE)) {
    return Promise.resolve(cache_get(url, FileType.IMAGE) || '');
  }
  const win = await getAFreeWin();
  const webContents = win.webContents;
  return new Promise((resolve) => {
    const listener = () => {
      webContents
        .executeJavaScript(code)
        .then((res: string) => {
          if (res === '') {
            resolve(res);
            return;
          }
          cache_save(url, FileType.IMAGE);
          resolve(res);
        })
        .catch((reason) => {
          logger.error('获取图片失败', reason);
        })
        .finally(() => {
          toggleWinStatus(win, true);
          logger.log(`获取成功：${url}`);
          webContents.off('did-finish-load', listener);
        });
    };
    webContents.on('did-finish-load', listener);
    win.loadURL(url);
  });
};
export default (win: BrowserWindow) => {
  parentWin = win;
  return () => {
    childWinds?.forEach((item) => {
      item?.win?.close();
    });
    clearInterval(timer);
  };
};
