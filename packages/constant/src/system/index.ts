/**
 *消息种类枚举
 */
export const MESSAGE_EVENT_KEY = {
  SEND_MESSAGE: 'send_message', // 发送提示信息
  SEND_NOTIFY_MESSAGE: 'send_notify_message', // 发送侧边信息
  SEND_LOG_MESSAGE: 'send_log_message', // 发送日志信息
  SEND_PROCESS_MESSAGE: 'send_process_message', // 发送进度条信息
  SEND_STEP_MESSAGE: 'send_step_message',
  SEND_CONSOLE_LOG: 'send_console_log',
  SEND_EXECUTE_JS_MESSAGE: 'send_execute_js_message',
};
/**
 * 传输对象
 */
export const TRANS_OBJ = 'obj||trans->';
/**
 * 定义元素属性
 */
export const ElementAttr = {
  src: 'src',
  title: 'title',
  href: 'href',
  class: 'class',
  dataWebp: 'data-webp',
  dataSrc: 'data-src',
  dataOriginal: 'data-original',
  poster: 'poster',
  dataSource: 'data-source',
  dataType: 'data-type',
  dataEcho: 'data-echo',
  dataError: 'data-error',
  alt: 'alt',
};
/**
 * 元素类型枚举
 */
export const ElementTypes = {
  a: 'a',
  img: 'img',
  h4: 'h4',
  h1: 'h1',
  video: 'video',
  source: 'source',
  p: 'p',
};
/**
 *保存代码事件
 */
export const SaveCodeEvent = 'save-code';
export const ReloadCodeEvent = 'reload-code';
/**
 * 代码解析占位符
 */
export const breakStr = '/* break */';
export const preBreak = '/* preBreak */';
export const SERVER_PORT = 4000;
