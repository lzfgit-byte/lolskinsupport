import { Modal, notification } from 'ant-design-vue';

import { f_checkCanAutoConfirm } from '@/utils/business';
export const notify = (key: any, msg: string, title: string, close = false) => {
  return notification.info({
    key,
    message: title,
    description: msg,
    duration: close ? 1 : 20,
  });
};

export const showFrontendConfirm = (
  title = '提示',
  content = '',
  okText = '确认',
  cancelText = '取消'
) => {
  return new Promise((resolve, reject) => {
    Modal.confirm({
      title,
      content,
      okText,
      cancelText,
      centered: true,
      onOk() {
        resolve(true);
      },
      onCancel() {
        reject(false);
      },
    });
  });
};
