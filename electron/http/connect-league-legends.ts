import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { webContents } from 'electron';
import { getGamePath } from '../export';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import { IS_USE_COMMAND, modToolsWrapper } from '../const';
import { gameflowMonitor } from './gameflowMonitor';
import { lcuConnector } from './lcuConnector';

export const getLockfile = () => {
  const gamePath = getGamePath();
  const lockfilePath = path.normalize(path.join(gamePath, `\\..\\lockfile`));
  const content = fs.readFileSync(lockfilePath, 'utf8');
  const [name, pid, port, password, protocol] = content.split(':');
  return { port, password, protocol, username: 'riot', address: '127.0.0.1' };
};

/** 安全发送消息：窗口已销毁时静默忽略，避免 "Object has been destroyed" 报错 */
const safeSend = (win: BrowserWindow, channel: string, ...args: any[]) => {
  try {
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  } catch {
    // webContents 可能已销毁，忽略即可
  }
};

export const initLcu = async (win: BrowserWindow) => {
  lcuConnector.startAutoConnect();
  await gameflowMonitor.start();
  gameflowMonitor.on('champion-selected', (args) => {
    safeSend(win, 'champion-selected', args?.championId);
  });
  gameflowMonitor.on('phase-changed', (phase, previousPhase) => {});
  setInterval(() => {
    safeSend(win, 'notify-lcu-connect', lcuConnector.isConnected());
    safeSend(win, 'notify-mod-tools-connect', modToolsWrapper.isRunning());
    safeSend(win, 'notify-state', { IS_USE_COMMAND });
  }, 1000);
};
