import { requestHtmlByWin } from './use-html-get-win';
import { win_get_data } from './use-win-to-execute-js';

export * from './use-get-blob-request';
export const requestHtmlByWindows = async (url: string) => {
  return requestHtmlByWin(url);
};
export const winGetData = async (code: string, url: string, show = false) => {
  return win_get_data(code, url, show);
};
