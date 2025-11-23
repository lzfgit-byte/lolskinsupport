/**
 * 通过窗口获取页面html的preload
 */
import { ipcRenderer } from 'electron';
import { IS_CAN_CONTINUE, NEED_SHOW_WINDOW_TIPS, USE_CHILD_WIN_EVENT } from '@ghs/constant';

const sendMessage = (msg: string) => {
  ipcRenderer
    .invoke(USE_CHILD_WIN_EVENT.STEP_MESSAGE, `${msg} f 【${window.location.href}】`)
    .then(() => 1);
};
const sendHtml = (html: string) => {
  ipcRenderer.invoke(USE_CHILD_WIN_EVENT.SEND_HTML, html).then(() => 1);
};
function showWindow() {
  ipcRenderer.invoke(USE_CHILD_WIN_EVENT.SHOW_WIN).then(() => 1);
}
function hideWindow() {
  ipcRenderer.invoke(USE_CHILD_WIN_EVENT.HIDE_WIN).then(() => 1);
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
function blobToString(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function () {
      const text = reader.result;
      resolve(text);
    };

    reader.onerror = function () {
      reject(new Error('Failed to convert Blob to string.'));
    };

    reader.readAsText(blob);
  });
}
function downloadURL() {
  // 检测人机校验
  if (!checkBoot()) {
    return;
  }
  const url = window.location.href;
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'blob';
  xhr.onprogress = function (progress) {
    sendMessage(`获取中，${progress.loaded}/${progress.total}`);
  };
  xhr.onload = function () {
    if (xhr.status === 200) {
      const blob = xhr.response;
      blobToString(blob).then((html: string) => {
        sendMessage(`获取成功，发送中`);
        sendHtml(html);
        hideWindow();
      });
    }
  };
  xhr.send();
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
