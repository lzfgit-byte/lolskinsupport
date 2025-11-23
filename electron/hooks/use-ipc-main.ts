/**
 *处理从页面传到的方法请求
 */
import { ipcMain } from 'electron';
import { isString } from '@ilzf/utils';
import { TRANS_OBJ } from '@ghs/constant';
import * as utils from '../utils';
import * as exp from '../export';

const funS = { ...utils, ...exp };

export default () => {
  Object.keys(funS).forEach((key) => {
    ipcMain.handle(key, (sender, ...args) => {
      args = args.map((item: string) => {
        if (isString(item) && item.startsWith(TRANS_OBJ)) {
          item = item.replace(TRANS_OBJ, '');
          item = JSON.parse(item);
        }
        return item;
      });
      return funS[key](...args);
    });
  });
};
