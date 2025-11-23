import { app, session } from 'electron';

export default () => {
  app.whenReady().then(() => {
    const filter = { urls: ['https://*/*'] };
    session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
      if (details.responseHeaders && details.responseHeaders['Set-Cookie']) {
        for (let i = 0; i < details.responseHeaders['Set-Cookie'].length; i++) {
          details.responseHeaders['Set-Cookie'][i] += ';SameSite=None;Secure';
        }
      }
      callback({ responseHeaders: details.responseHeaders });
    });
  });
};
