// 引入模块
import fs from 'node:fs';
import path from 'node:path';
import { LogMsgUtil, NotifyMsgUtil } from '../utils/message';
const defaultSourceDir = 'E:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960';
const defaultTargetDir = 'E:\\BaiduNetdiskDownload\\3d';
// 源目录与目标目录
export const pluginMoveFiles = (
  keyword: string,
  sourceDir = defaultSourceDir,
  targetDir = defaultTargetDir
) => {
  // 搜索关键字
  // 创建目标文件夹（如果不存在）
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const key = 'movekey';
  NotifyMsgUtil.sendNotifyMsg('开始移动文件', `搜索关键字: ${keyword}`, key);
  // 递归搜索函数
  function searchAndMove(dir: string) {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        // 递归搜索子文件夹
        searchAndMove(fullPath);
      } else if (item.isFile()) {
        if (item.name.includes(keyword)) {
          const destPath = path.join(targetDir, item.name);

          try {
            // 移动文件
            fs.renameSync(fullPath, destPath);
            LogMsgUtil.sendLogMsg(`✅ 已移动: ${fullPath} -> ${destPath}`);
            NotifyMsgUtil.sendNotifyMsg(
              '开始移动文件',
              `✅ 已移动: ${fullPath} -> ${destPath}`,
              key
            );
          } catch (err) {
            LogMsgUtil.sendLogMsg(`❌ 移动失败: ${fullPath}`);
            NotifyMsgUtil.sendNotifyMsg('开始移动文件', `❌ 移动失败: ${fullPath}`, key);
          }
        }
      }
    }
  }
  searchAndMove(sourceDir);
  NotifyMsgUtil.close(key);
};
export const pluginGetMove = () => {
  return { defaultTargetDir, defaultSourceDir };
};
