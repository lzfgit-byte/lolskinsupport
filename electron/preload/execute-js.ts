import { ipcRenderer } from 'electron';

/**
 * 通过窗口获取页面html的preload
 */
const USE_CHILD_WIN_EVENT = {
  SEND_HTML: 'send_html', // 发送html的事件
  HIDE_WIN: 'hide_win', // 隐藏弹出窗口
  SHOW_WIN: 'show_win', // 展示弹出窗口
  STEP_MESSAGE: 'step_message', // 步进信息
  JS_SEND_HTML: 'js_send_html', // 发送html的事件
  JS_HIDE_WIN: 'js_hide_win', // 隐藏弹出窗口
  JS_SHOW_WIN: 'js_show_win', // 展示弹出窗口
};
const NEED_SHOW_WINDOW_TIPS = [
  'Just a moment...',
  'Rule34.xxx CAPTCHA',
  'Checking your Browser',
  'CAPTCHA',
];
const MESSAGE_EVENT_KEY = {
  SEND_MESSAGE: 'send_message', // 发送提示信息
  SEND_NOTIFY_MESSAGE: 'send_notify_message', // 发送侧边信息
  SEND_LOG_MESSAGE: 'send_log_message', // 发送日志信息
  SEND_PROCESS_MESSAGE: 'send_process_message', // 发送进度条信息
  SEND_STEP_MESSAGE: 'send_step_message',
  SEND_CONSOLE_LOG: 'send_console_log',
  SEND_EXECUTE_JS_MESSAGE: 'send_execute_js_message',
};
const IS_CAN_CONTINUE = (title: string) => {
  for (let i = 0; i < NEED_SHOW_WINDOW_TIPS.length; i++) {
    if (title && title?.indexOf(NEED_SHOW_WINDOW_TIPS[i]) > -1) {
      return false;
    }
  }
  return true;
};
// @ts-ignore
const sendMessage = (msg: string) => {
  ipcRenderer.invoke(MESSAGE_EVENT_KEY.SEND_EXECUTE_JS_MESSAGE, msg);
};
const sendHtml = (html: string) => {
  ipcRenderer.invoke(USE_CHILD_WIN_EVENT.JS_SEND_HTML, html).then(() => 1);
};
function showWindow() {
  ipcRenderer.invoke(USE_CHILD_WIN_EVENT.JS_SHOW_WIN).then(() => 1);
}
sendMessage(`获取页面中`);
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise((resolve, reject) => {
    try {
      const timer = setTimeout(() => {
        sendMessage('十秒超时文档未准备好');
        reject('超时');
      }, 10000);
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true);
          clearTimeout(timer);
        }
      });
    } catch (e) {
      sendMessage('检测加载状态报错');
      reject(e);
    }
  });
}

function checkBoot() {
  // 检测人机校验

  const title = document.title.trim();
  sendMessage(`【${title}】`);
  if (IS_CAN_CONTINUE(title)) {
    return true;
  }
  showWindow();
  return false;
}
function downloadURL() {
  // 检测人机校验
  if (!checkBoot()) {
    return;
  }
  sendMessage(`加载成功`);
  sendHtml('');
}

domReady()
  .then(() => {
    downloadURL();
  })
  .catch((e) => {
    if (document) {
      document.body.innerHTML = `<div>${e?.message || e}</div>
                                  <div onclick="window.location.reload()">重新加载</div>`;
    }
  });

/**
 * 窗口之间相互通信的功能
 * @param ev
 */
window.onmessage = (ev) => {
  console.log(ev.data.payload);
};
