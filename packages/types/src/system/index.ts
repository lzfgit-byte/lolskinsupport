export const FileType = {
  HTML: 'html',
  IMAGE: 'image',
  VIDEO: 'video',
  FILE: 'file',
  TEXT: 'text',
};

export interface SystemSetting {
  imgWinMax: number;
  imgWinMin: number;
  proxySocks5: string;
  proxyHttp: string;
  proxyWhitelist: string;
  dbVersion: number;
}
