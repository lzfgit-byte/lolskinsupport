import { BrowserWindow, ipcMain, screen } from 'electron';
import { executeFunc } from '@ilzf/utils';
import type { ShowSliderConfirmType } from '@ghs/constant';
import { confirmHtml } from './export-confirm-html';

let htmlContent = confirmHtml;

/** 第一个通知距离屏幕上方的距离 */
const BASE_Y = 30;
/** 相邻通知之间的间距 */
const GAP = 20;

interface NoticeItem {
  win: BrowserWindow | null;
  height: number;
  closing: boolean;
}

/** 屏幕上还活着的通知，按从上到下的顺序排列 */
const notices: NoticeItem[] = [];

/** 计算第 index 个通知应有的 y 坐标（前面所有通知高度 + 间距之和） */
const calcY = (index: number) => {
  let y = BASE_Y;
  for (let i = 0; i < index; i++) {
    y += notices[i].height + GAP;
  }
  return y;
};

/** 纵向平滑移动某个通知窗口 */
const animateY = (win: BrowserWindow, targetY: number) => {
  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(timer);
      return;
    }
    const [x, y] = win.getPosition();
    const diff = targetY - y;
    if (diff === 0) {
      clearInterval(timer);
      return;
    }
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 12);
    win.setPosition(x, y + step);
  }, 16);
};

/** 重新排布所有通知：删除中间某个后，它后面的会自动上移 */
const relayout = () => {
  notices.forEach((item, index) => {
    if (item.win && !item.win.isDestroyed()) {
      animateY(item.win, calcY(index));
    }
  });
};

/** 横向滑入 / 滑出动画 */
const slideX = (win: BrowserWindow, fromX: number, toX: number, onDone?: () => void) => {
  let x = fromX;
  const step = 24; // 步长：可调，越大越快但更“跳”
  const dir = toX > fromX ? 1 : -1;
  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(timer);
      onDone && onDone();
      return;
    }
    x += step * dir;
    const reached = dir > 0 ? x >= toX : x <= toX;
    const [, y] = win.getPosition();
    if (reached) {
      win.setPosition(toX, y);
      clearInterval(timer);
      onDone && onDone();
      return;
    }
    win.setPosition(Math.round(x), y);
  }, 16);
};

export const showSliderConfirm = (opt: ShowSliderConfirmType, okFunc?: any, cFunc?: any) => {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const hashId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const targetWidth = opt.width || 300;
  const targetHeight = opt.height || 100;
  const targetX = screenWidth - targetWidth - 20;

  // 追加到队列末尾，y 由当前队列决定
  const item: NoticeItem = { win: null, height: targetHeight, closing: false };
  const targetY = calcY(notices.length);
  notices.push(item);

  const win = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    x: screenWidth, // 从屏幕最右边开始
    y: targetY,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  item.win = win;
  const strReplaceAll = (str: string, find: string, replace: string) => {
    while (str.indexOf(find) > -1) {
      str = str.replace(find, replace);
    }
    return str;
  };
  const getHtml = () => {
    return strReplaceAll(htmlContent, '$hashId', hashId)
      .replace('$message', opt.msg)
      .replace('$imageSrc', opt.src)
      .replace('$width', `${targetWidth}`)
      .replace('$height', `${targetHeight}`)
      .replace('$title', opt.title || '提醒')
      .replace('$showBtn', `${opt.showBtn || false}`)
      .replace('$delay', `${opt.delay || 3000}`);
  };
  const base64Html = Buffer.from(getHtml()).toString('base64');
  win.loadURL(`data:text/html;base64,${base64Html}`);

  const removeListeners = () => {
    ipcMain.off(`${hashId}-confirm-cancel`, cancelFunc);
    ipcMain.off(`${hashId}-confirm-confirm`, confirmFunc);
  };

  /** 关闭通知：先从队列移除并让后面的通知上移，再滑出关闭自己 */
  const dismiss = (cb?: any) => {
    if (item.closing) {
      return;
    }
    item.closing = true;
    removeListeners();
    const index = notices.indexOf(item);
    if (index > -1) {
      notices.splice(index, 1);
    }
    relayout();
    const [curX] = win.getPosition();
    slideX(win, curX, screenWidth + 20, () => {
      if (!win.isDestroyed()) {
        win.close();
      }
      item.win = null;
      if (typeof cb === 'function') {
        executeFunc(cb);
      }
    });
  };

  const cancelFunc = () => dismiss(cFunc);
  const confirmFunc = () => dismiss(okFunc);

  ipcMain.on(`${hashId}-confirm-confirm`, confirmFunc);
  ipcMain.on(`${hashId}-confirm-cancel`, cancelFunc);

  win.once('ready-to-show', () => {
    win.show();
    slideX(win, screenWidth, targetX);
  });

  win.on('closed', () => {
    // 兜底：窗口被外部关闭时，清理队列并重排
    if (!item.closing) {
      item.closing = true;
      removeListeners();
      const index = notices.indexOf(item);
      if (index > -1) {
        notices.splice(index, 1);
      }
      relayout();
    }
    item.win = null;
  });
};
