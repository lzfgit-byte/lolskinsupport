import { join } from 'node:path';
import { release } from 'node:os';
import { Menu, app } from 'electron';

process.env.DIST_ELECTRON = join(__dirname, '..');
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist');
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST;
// 安全设置
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
// app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('charset', 'utf-8');
// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) {
  app.disableHardwareAcceleration();
}

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') {
  app.setAppUserModelId(app.getName());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
Menu.setApplicationMenu(null);
