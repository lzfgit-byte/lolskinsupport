import { notification } from 'ant-design-vue';
export const notify = (key: any, msg: string, title: string, close = false) => {
  return notification.info({
    key,
    message: title,
    description: msg,
    duration: close ? 1 : 20,
  });
};
