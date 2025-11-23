import * as os from 'node:os';
import { ensureFileSync, writeFileSync } from 'fs-extra';
import { LogEntity } from '@ghs/constant';
import { APP_PATHS } from '../const/app-paths';
import { getCurrentDate } from './KitUtil';

const LOG_FILE_PATH = `${APP_PATHS.db_dir}/log.txt`;

const writeLog = (...args: any[]): string => {
  ensureFileSync(LOG_FILE_PATH);
  const info = `[info] ${getCurrentDate()} ${args.join('')} ${os.EOL}`;
  writeFileSync(LOG_FILE_PATH, info, {
    encoding: 'utf-8',
    flag: 'a',
  });
  return info;
};
const writeLogError = (...args: any[]) => {
  ensureFileSync(LOG_FILE_PATH);
  const error = `[error] ${getCurrentDate()} ${args.join('')} ${os.EOL}`;
  writeFileSync(LOG_FILE_PATH, `[error] ${getCurrentDate()} ${args.join('')} ${os.EOL}`, {
    encoding: 'utf-8',
    flag: 'a',
  });
  return error;
};
export const logger = {
  enable: false,
  error: (...args: any[]) => {
    writeLogError(...args);
  },
  log: (...args: any[]) => {
    writeLog(...args);
    logger.enable && console.log(...args);
  },
  db_log: (...args: any[]) => {
    LogEntity.log(args.join(' '), 'info');
  },
  db_error: (...args: any[]) => {
    LogEntity.log(args.join(' '), 'error');
  },
};
