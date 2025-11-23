import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import dayjs from 'dayjs';

export const getCurrentDate = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
export const execPercentage = (cur: number, total: number): number => {
  return Math.min(+((cur / total) * 100).toFixed(0), 100);
};
export const resolvePreload = (fileName: string) => join(__dirname, `../preload/${fileName}.js`);
export const resolvePublic = (filePath: string) => join(process.env.PUBLIC, filePath);
export const eventEmitter = new EventEmitter();

export const getLocalIPs = () => {
  const networkInterfaces = os.networkInterfaces();
  const ips = [];

  // 遍历所有的网络接口
  for (const name of Object.keys(networkInterfaces)) {
    // 对于每个接口，遍历它的所有地址
    for (const interfaceInfo of networkInterfaces[name]) {
      // 我们只关心IPv4地址，并且是“非内部”地址（不是127.0.0.1这样的环回地址）
      if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
        ips.push(interfaceInfo.address);
      }
    }
  }
  return ips;
};
