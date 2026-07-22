import { ipcRenderer } from 'electron';
import { MESSAGE_EVENT_KEY, TRANS_OBJ } from '@ghs/constant';
import type { MessageInfo } from '@ghs/types/src';
import { message } from 'ant-design-vue';
import { isObject } from '@ilzf/utils';

import bus from '@/utils/bus';
import { notify } from '@/utils/kit-utils';
import useGlobalState from '@/hooks/use-global-state';
// 执行后台的方法
export const executeFunction = async (funcName: string, ...args: any[]) => {
  args = args.map((item) => {
    if (isObject(item)) {
      return `${TRANS_OBJ}${JSON.stringify(item)}`;
    }
    return item;
  });
  return await ipcRenderer.invoke(funcName, ...args);
};
const { LogUtil, heroId, lcuState, heroIdAliasMap, heroAlias, modToolsState, isUseCommand } =
  useGlobalState();
// 获取后台的消息
ipcRenderer.on(MESSAGE_EVENT_KEY.SEND_MESSAGE, (_event, args: MessageInfo) => {
  const { msg, type } = args;
  switch (type) {
    case 'success': {
      message.success(msg).then(() => 1);
      break;
    }
    case 'error': {
      message.error(msg).then(() => 1);
      break;
    }
    case 'info': {
      message.info(msg).then(() => 1);
      break;
    }
    case 'warning': {
      message.warn(msg).then(() => 1);
    }
  }
});
ipcRenderer.on(MESSAGE_EVENT_KEY.SEND_NOTIFY_MESSAGE, (_event, args: MessageInfo) => {
  const { key, title, msg, close } = args;
  notify(key, msg, title, close);
});
ipcRenderer.on(MESSAGE_EVENT_KEY.SEND_PROCESS_MESSAGE, (_event, args: MessageInfo) => {
  const { key } = args;
  bus.emit(key, args);
});

ipcRenderer.on(MESSAGE_EVENT_KEY.SEND_LOG_MESSAGE, (_event, args: MessageInfo) => {
  LogUtil.log(args.msg);
});
ipcRenderer.on(MESSAGE_EVENT_KEY.SEND_CONSOLE_LOG, (_event, args: MessageInfo) => {
  console.log(args.msg);
});
ipcRenderer.on('champion-selected', (_event, championId: string) => {
  heroId.value = `${championId}`;
  heroAlias.value = heroIdAliasMap[`${championId}`];
  bus.emit('champion-selected', `${championId}`);
});
ipcRenderer.on('notify-lcu-connect', (_event, lcuState_: boolean) => {
  lcuState.value = lcuState_;
});
ipcRenderer.on('notify-mod-tools-connect', (_event, flag: boolean) => {
  modToolsState.value = flag;
});
ipcRenderer.on('notify-state', (_event, obj: { IS_USE_COMMAND: boolean }) => {
  isUseCommand.value = obj.IS_USE_COMMAND;
});
