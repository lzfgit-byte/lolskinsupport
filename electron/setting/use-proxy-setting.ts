import type { BrowserWindow } from 'electron';
import useSystemSetting from './use-system-setting';
let func = `function FindProxyForURL(url, host) {
  let ignore = [$proxyWhitelist];
  for (let i = 0; i < ignore.length; i++) {
    if (url.indexOf(ignore[i]) > -1) {
      return "DIRECT";
    }
  }
  return "PROXY $proxyHttp";
}`;

const doJob = async (win: BrowserWindow) => {
  const { proxyHttp, proxyWhitelist } = await useSystemSetting();
  const pacUrl = `data:video/mp2t;base64,${Buffer.from(
    func.replace('$proxyHttp', proxyHttp).replace('$proxyWhitelist', proxyWhitelist),
    'utf8'
  ).toString('base64')}`;
  await win.webContents.session.setProxy({
    pacScript: pacUrl,
  });
};

export default (win: BrowserWindow) => {
  doJob(win).then(() => true);
};
