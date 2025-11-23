import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { webContents } from 'electron';
import { getGamePath } from '../export';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import { gameflowMonitor } from './gameflowMonitor';
import { lcuConnector } from './lcuConnector';

export const getLockfile = () => {
  const gamePath = getGamePath();
  const lockfilePath = path.normalize(path.join(gamePath, `\\..\\lockfile`));
  const content = fs.readFileSync(lockfilePath, 'utf8');
  const [name, pid, port, password, protocol] = content.split(':');
  return { port, password, protocol, username: 'riot', address: '127.0.0.1' };
};
export const initLcu = async (win: BrowserWindow) => {
  lcuConnector.connect();
  gameflowMonitor.start();
  gameflowMonitor.on('champion-selected', (args) => {
    win?.webContents?.send('champion-selected', args?.championId);
  });
  gameflowMonitor.on('phase-changed', (phase, previousPhase) => {});
  return () => {
    lcuConnector.disconnect();
    gameflowMonitor.stop();
  };
};
