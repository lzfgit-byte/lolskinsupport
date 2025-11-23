import { showNotify } from 'vant';
const screenWidth = window.innerWidth;
export const isMobile = screenWidth <= 768;
export const calcWidthAdapter = (source: string, target = `${screenWidth}`) => {
  const sourceWidth = parseInt(source);
  const targetWidth = parseInt(target);
  if (isMobile) {
    return (targetWidth * 43) / 100 / sourceWidth;
  } else {
    return (targetWidth * 30) / 100 / sourceWidth;
  }
};
export const calcH5Width = (width: string) => {
  if (isMobile) {
    return `${parseInt(width) / 2}px`;
  }
  return `${parseInt(width) / 2}px`;
};

// 主要通知

export class message {
  static success(msg: string) {
    showNotify({ type: 'success', message: msg });
  }

  static error(msg: string) {
    showNotify({ type: 'danger', message: msg });
  }

  static warn(msg: string) {
    showNotify({ type: 'warning', message: msg });
  }
}
export const widthAdapter = (width: string) => calcWidthAdapter(width);
