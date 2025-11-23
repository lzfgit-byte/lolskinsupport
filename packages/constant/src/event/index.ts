/**
 *使用新建后台窗口来获取html时 事件的交互
 */
export const USE_CHILD_WIN_EVENT = {
  SEND_HTML: 'send_html', // 发送html的事件
  HIDE_WIN: 'hide_win', // 隐藏弹出窗口
  SHOW_WIN: 'show_win', // 展示弹出窗口
  STEP_MESSAGE: 'step_message', // 步进信息
  JS_SEND_HTML: 'js_send_html', // 发送html的事件
  JS_HIDE_WIN: 'js_hide_win', // 隐藏弹出窗口
  JS_SHOW_WIN: 'js_show_win', // 展示弹出窗口
};
export const NEED_SHOW_WINDOW_TIPS = [
  'Just a moment...',
  'Rule34.xxx CAPTCHA',
  'Checking your Browser',
  'CAPTCHA',
];

export const IS_CAN_CONTINUE = (title: string) => {
  for (let i = 0; i < NEED_SHOW_WINDOW_TIPS.length; i++) {
    if (title && title?.indexOf(NEED_SHOW_WINDOW_TIPS[i]) > -1) {
      return false;
    }
  }
  return true;
};
