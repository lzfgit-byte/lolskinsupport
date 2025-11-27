import { requestHtmlByWin } from './use-html-get-win';

export * from './use-get-blob-request';
export const requestHtmlByWindows = async (url: string) => {
  return requestHtmlByWin(url);
};
