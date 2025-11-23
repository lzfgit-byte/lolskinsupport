import path from 'node:path';
const PATH_KEY = 'ghs4.0';
let temp_dir = `${process.env.LOCALAPPDATA}\\${PATH_KEY}`; // aka C:\Users\用户名\AppData\Local\ghs4.0
const cache_path = path.join(process.cwd(), '\\ghs-cache');

export class APP_PATHS {
  static get db_dir() {
    return temp_dir;
  }

  static get cache_path() {
    return cache_path;
  }
}
