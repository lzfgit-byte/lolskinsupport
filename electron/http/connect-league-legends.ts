import fs from 'node:fs';
import path from 'node:path';
import { getGamePath } from '../export';
import { gameflowMonitor } from './gameflowMonitor';
import { lcuConnector } from './lcuConnector';

export const getLockfile = () => {
  const gamePath = getGamePath();
  const lockfilePath = path.normalize(path.join(gamePath, `\\..\\lockfile`));
  const content = fs.readFileSync(lockfilePath, 'utf8');
  const [name, pid, port, password, protocol] = content.split(':');
  return { port, password, protocol, username: 'riot', address: '127.0.0.1' };
};
export const initLcu = async () => {
  lcuConnector.connect();
  gameflowMonitor.start();
  gameflowMonitor.on('champion-selected', (args) => {
    console.log(args);
  });
  gameflowMonitor.on('champion-selected', (args) => {
    console.log(args);
  });
  gameflowMonitor.on('phase-changed', (phase, previousPhase) => {
    console.log(phase, ' ', previousPhase);
  });
  console.log(await lcuConnector.isConnected());
};
// export const initWs = () => {
//   const { port, password } = getLockfile();
//   const token = Buffer.from(`riot:${password}`).toString('base64');
//
//   // 连接 WSS 事件侦听（最重要）
//   const ws = new WebSocket(`wss://127.0.0.1:${port}/`, {
//     rejectUnauthorized: false,
//     headers: {
//       Authorization: `Basic ${token}`,
//     },
//   });
//
//   ws.on('open', () => {
//     console.log('🟢 已连接到 LCU WebSocket');
//
//     // 订阅英雄选择事件
//     ws.send(
//       JSON.stringify([5, 'OnJsonApiEvent', ['lol-champ-select', '/lol-champ-select/v1/session']])
//     );
//   });
//
//   ws.on('message', (msg) => {
//     try {
//       const data = JSON.parse(msg);
//       console.log(data);
//       if (data.eventType !== 'Update' || !data.data) {
//         return;
//       }
//
//       const session = data.data;
//       if (!session || !session.myTeam) {
//         return;
//       }
//
//       const me = session.myTeam.find((player) => player.cellId === session.localPlayerCellId);
//       if (me && me.championId > 0) {
//         console.log(me);
//         console.log(`📌 已选择英雄 ID: ${me.championId}`);
//       }
//     } catch {}
//   });
//
//   ws.on('close', () => console.log('🔴 LCU WebSocket 已断开'));
//   ws.on('error', () => console.log('⚠️ LCU WebSocket 连接失败'));
// };
