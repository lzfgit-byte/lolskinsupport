import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Path from 'node:path';
import AdmZip from 'adm-zip';
import { modToolsWrapper } from '../const';
import { LogMsgUtil, MessageUtil, NotifyMsgUtil } from '../utils/message';

// 模拟 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SKIN_DEFAULT_SUFFIX = 'wad_skins';
// --- 配置区 ---
let WAD_SOURCE_DIR = 'E:\\game\\Riot Games\\League of Legends\\Game\\DATA\\FINAL\\Champions';
let EXTRACT_BASE_DIR = 'C:\\Users\\18074\\Downloads\\skins';
let OUTPUT_BASE_DIR = 'C:\\Users\\18074\\Downloads\\skin_out';
let OUTPUT_WAD_BASE_DIR = 'C:\\Users\\18074\\Downloads\\wad_skins';

export const setConfigData = (gamePath, outBasePath) => {
  WAD_SOURCE_DIR = Path.normalize(`${gamePath}\\DATA\\FINAL\\Champions`);
  EXTRACT_BASE_DIR = Path.normalize(`${outBasePath}\\skins`);
  OUTPUT_BASE_DIR = Path.normalize(`${outBasePath}\\skin_out`);
  OUTPUT_WAD_BASE_DIR = Path.normalize(`${outBasePath}\\${SKIN_DEFAULT_SUFFIX}`);
};

const logData = (msg: string, ...data: any[]) => {
  console.log(msg, data);
  LogMsgUtil.sendLogMsg(msg + data?.toString());
};
const deleteFile = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logData(` 删除文件失败: ${filePath}`);
  }
};
/**
 * 执行系统命令
 */
const runCommand = async (command: string, ...args: any[]) => {
  await modToolsWrapper.execToolWithTimeout(command, args, 50000, true).catch((msg) => {
    MessageUtil.error(msg);
  });
};
function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    fs.rmSync(full, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}
/**
 * 处理反编译后的 .py 文件，进行逻辑掉包替换
 * @param {string} pyPath - .py 文件的绝对路径
 * @param {string} heroName - 英雄名称（用于路径填充）
 */
const patchPyFile = (pyPath, heroName) => {
  if (!fs.existsSync(pyPath)) {
    return;
  }

  try {
    let content = fs.readFileSync(pyPath, 'utf-8');
    const lines = content.split('\n');

    const processedLines = lines.map((line) => {
      // 1. 匹配 SkinCharacterDataProperties
      // 逻辑：替换 = 号前面的内容，保留缩进
      if (line.includes('SkinCharacterDataProperties')) {
        // 正则匹配：(缩进)(任意内容)=(剩余部分)
        return line.replace(/^(\s*).*(\s*=\s*.*)$/, `$1"Characters/${heroName}/Skins/Skin0"$2`);
      }

      // 2. 匹配 mResourceResolver
      // 逻辑：替换 = 号后面的内容
      if (line.includes('mResourceResolver')) {
        return line.replace(/^(.*=\s*)(.*)$/, `$1"Characters/${heroName}/Skins/Skin0/Resources"`);
      }

      // 3. 匹配 包含 ResourceResolver 但不是 mResourceResolver 的行（或根据你要求的通用匹配）
      // 逻辑：替换 = 号前面的内容
      if (line.includes('ResourceResolver') && !line.includes('mResourceResolver')) {
        return line.replace(
          /^(\s*).*(\s*=\s*.*)$/,
          `$1"Characters/${heroName}/Skins/Skin0/Resources"$2 `
        );
      }
      return line;
    });

    fs.writeFileSync(pyPath, processedLines.join('\n'), 'utf-8');
    logData(` [修改成功] 已优化代码逻辑: ${path.basename(pyPath)}`);
  } catch (err) {
    logData(` [修改失败] 处理 ${pyPath} 时出错:`, err.message);
  }
};

const packToWad = async (skinFolderPath, heroName, skinId, heroId) => {
  try {
    // 构建输出的 WAD 文件路径，例如: ...\annie\skin1\1.wad.client
    const wadName = `${heroId || heroName}_${skinId}`;
    const outputWadPath = path.join(OUTPUT_WAD_BASE_DIR, `${wadName}.wad.client`);

    // 这里的路径结构必须严格按照 wad-make 的参数要求：
    // 参数1: 要打包的源文件夹路径
    // 参数2: 输出的 WAD 文件路径
    // 注意：路径带空格时务必使用双引号包裹
    const command = `E:\\lolsupport\\cslol-manager\\cslol-tools\\wad-make.exe`;

    console.log(` [正在封包] 生成 WAD: ${outputWadPath}`);
    await runCommand(command, skinFolderPath, outputWadPath);

    await createZipFile(wadName, outputWadPath, heroName);
    return outputWadPath;
  } catch (err) {
    console.error(` [封包失败] ${skinFolderPath}:`, err.message);
  }
};
export const createZipFile = async (wadName, outWadFilePath, heroName) => {
  try {
    // 1. 确保输出目录存在
    if (!fs.existsSync(OUTPUT_WAD_BASE_DIR)) {
      fs.mkdirSync(OUTPUT_WAD_BASE_DIR, { recursive: true });
    }

    const zip = new AdmZip();

    // 2. 添加 info.json (直接从内存添加字符串)
    const info = {
      Author: 'lzf',
      Description: 'xxxx',
      Name: wadName,
      Version: 'Patch 16.4.1',
    };
    zip.addFile('META/info.json', Buffer.from(JSON.stringify(info, null, 2), 'utf8'));

    // 3. 添加 WAD 文件 (读取本地文件并指定压缩包内路径)
    if (fs.existsSync(outWadFilePath)) {
      // 注意：addLocalFile 第一个参数是源文件，第二个参数是压缩包内的【目录】
      // 为了精确控制文件名，我们使用 addFile
      const wadBuffer = fs.readFileSync(outWadFilePath);
      zip.addFile(`WAD/${heroName}.wad.client`, wadBuffer);
    } else {
      throw new Error(`源文件不存在: ${outWadFilePath}`);
    }

    // 4. 写入磁盘 (writeZip 是同步的，或者提供回调)
    const zipPath = Path.join(OUTPUT_WAD_BASE_DIR, `${wadName}.zip`);

    // 我们将其包装成 Promise 确保执行流可控
    await new Promise((resolve, reject) => {
      zip.writeZip(zipPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(` [ZIP完成] ${wadName}.zip`);
          resolve(zipPath);
        }
      });
    });

    deleteFile(outWadFilePath);
    return zipPath;
  } catch (err) {
    console.error(` [ZIP失败] ${wadName}:`, err.message);
    throw err;
  }
};

export const loadSkinDataByFile = async (idNameMap: Record<string, any>, fullWadPath: string) => {
  emptyDir(EXTRACT_BASE_DIR);
  emptyDir(OUTPUT_BASE_DIR);
  if (!fs.existsSync(fullWadPath)) {
    MessageUtil.error(`文件不存在: ${fullWadPath}`);
    return;
  }
  const nameIdMap = {};
  Object.keys(idNameMap).forEach((key: string) => {
    nameIdMap[idNameMap[key]] = key;
  });
  const heroName = path.basename(fullWadPath, path.extname(fullWadPath));
  const heroId = nameIdMap[heroName.split('.')[0]];
  emptyDir(EXTRACT_BASE_DIR);
  // 3. 解压当前 WAD
  await runCommand(
    `E:\\lolsupport\\cslol-manager\\cslol-tools\\wad-extract.exe`,
    fullWadPath,
    EXTRACT_BASE_DIR
  );
  // 4. 定位英雄目录 (data/characters/XXXX)
  const charactersDir = path.join(EXTRACT_BASE_DIR, 'data', 'characters');
  if (!fs.existsSync(charactersDir)) {
    logData(`跳过: 内部不含 characters 目录`);
    return;
  }
  const heroes = fs.readdirSync(charactersDir).filter((f) => {
    return fs.statSync(path.join(charactersDir, f)).isDirectory();
  });
  // 获取该 WAD 里的英雄名（如 annie）
  let skinId = 0;
  while (true) {
    let flag = false;
    for (const heroNameInLine of heroes) {
      const skinsDir = path.join(charactersDir, heroNameInLine, 'skins');
      if (!fs.existsSync(skinsDir)) {
        continue;
      }

      // 5. 递增探测 SkinId
      const binFileName = `skin${skinId}.bin`;
      const sourceBinPath = path.join(skinsDir, binFileName);

      // 如果找不到当前 ID 的文件，跳出循环去处理下一个英雄
      if (!fs.existsSync(sourceBinPath)) {
        flag = true;
        break;
      }

      // 6. 创建两级目录结构: 英雄名 -> 皮肤ID
      // 路径示例: C:\Users\18074\Downloads\annie\skin1\data\characters\annie\skins
      const targetSkinDir = path.join(
        OUTPUT_BASE_DIR,
        heroName,
        `skin${skinId}\\data\\characters\\${heroNameInLine}\\skins`
      );
      if (!fs.existsSync(targetSkinDir)) {
        fs.mkdirSync(targetSkinDir, { recursive: true });
      }

      // 7. 复制并解包
      const destBinPath = path.join(targetSkinDir, `skin0.bin`);
      fs.copyFileSync(sourceBinPath, destBinPath);

      // 调用全局 ritobin_cli 自动解出 .py
      await runCommand(`E:\\lolsupport\\ritobin\\bin\\ritobin_cli`, destBinPath);
      const pyPath = destBinPath.replace('.bin', '.py');
      patchPyFile(pyPath, heroNameInLine);
      deleteFile(destBinPath);
      await runCommand(`E:\\lolsupport\\ritobin\\bin\\ritobin_cli`, pyPath);
      deleteFile(pyPath);
    }
    if (flag) {
      break;
    }
    await packToWad(
      path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`),
      heroName,
      skinId,
      heroId
    );
    skinId++;
  }
  logData(`${fullWadPath} 封包完成`);
  emptyDir(EXTRACT_BASE_DIR);
  emptyDir(OUTPUT_BASE_DIR);
};
export const loadSkinData = async (idNameMap: Record<string, any>) => {
  // 1. 初始化提取目录
  emptyDir(EXTRACT_BASE_DIR);
  emptyDir(OUTPUT_BASE_DIR);
  emptyDir(OUTPUT_WAD_BASE_DIR);
  const nameIdMap = {};
  Object.keys(idNameMap).forEach((key: string) => {
    nameIdMap[idNameMap[key]] = key;
  });

  // 2. 读取所有 WAD 文件
  if (!fs.existsSync(WAD_SOURCE_DIR)) {
    logData(`源目录不存在: ${WAD_SOURCE_DIR}`);
    return;
  }
  const wadFiles = fs.readdirSync(WAD_SOURCE_DIR).filter((f) => {
    const isWad = f.endsWith('.wad.client');
    const isNotLocale = !f.includes('zh_CN'); // 关键：过滤掉语言包
    return isWad && isNotLocale;
  });
  const keys = `${new Date().getTime()}`;
  const longLength = wadFiles?.length;
  let current = 1;
  const notifyMsg = (msg: string, ...args) => {
    NotifyMsgUtil.sendNotifyMsg(`${current} / ${longLength}`, msg, keys);
    logData(msg, args);
  };
  for (const wadFile of wadFiles) {
    const heroName = wadFile.split('.')[0];
    const heroId = nameIdMap[heroName];
    const fullWadPath = path.join(WAD_SOURCE_DIR, wadFile);
    notifyMsg(`\n==========================================`);
    notifyMsg(`正在解压 WAD: ${wadFile}`);

    emptyDir(EXTRACT_BASE_DIR);
    // 3. 解压当前 WAD
    await runCommand(
      `E:\\lolsupport\\cslol-manager\\cslol-tools\\wad-extract.exe`,
      fullWadPath,
      EXTRACT_BASE_DIR
    );

    // 4. 定位英雄目录 (data/characters/XXXX)
    const charactersDir = path.join(EXTRACT_BASE_DIR, 'data', 'characters');
    if (!fs.existsSync(charactersDir)) {
      notifyMsg(`跳过: 内部不含 characters 目录`);
      continue;
    }
    const heroes = fs.readdirSync(charactersDir).filter((f) => {
      return fs.statSync(path.join(charactersDir, f)).isDirectory();
    });
    // 获取该 WAD 里的英雄名（如 annie）
    let skinId = 0;
    while (true) {
      let flag = false;
      for (const heroNameInLine of heroes) {
        const skinsDir = path.join(charactersDir, heroNameInLine, 'skins');
        if (!fs.existsSync(skinsDir)) {
          continue;
        }

        notifyMsg(`正在处理英雄: ${heroNameInLine}`);
        // 5. 递增探测 SkinId
        const binFileName = `skin${skinId}.bin`;
        const sourceBinPath = path.join(skinsDir, binFileName);

        // 如果找不到当前 ID 的文件，跳出循环去处理下一个英雄
        if (!fs.existsSync(sourceBinPath)) {
          flag = true;
          break;
        }

        // 6. 创建两级目录结构: 英雄名 -> 皮肤ID
        // 路径示例: C:\Users\18074\Downloads\annie\skin1\data\characters\annie\skins
        const targetSkinDir = path.join(
          OUTPUT_BASE_DIR,
          heroName,
          `skin${skinId}\\data\\characters\\${heroNameInLine}\\skins`
        );
        if (!fs.existsSync(targetSkinDir)) {
          fs.mkdirSync(targetSkinDir, { recursive: true });
        }

        // 7. 复制并解包
        const destBinPath = path.join(targetSkinDir, `skin0.bin`);
        fs.copyFileSync(sourceBinPath, destBinPath);
        notifyMsg(` [提取成功] ${heroNameInLine} -> skin${skinId} -> ${binFileName}`);

        // 调用全局 ritobin_cli 自动解出 .py
        await runCommand(`E:\\lolsupport\\ritobin\\bin\\ritobin_cli`, destBinPath);
        const pyPath = destBinPath.replace('.bin', '.py');
        patchPyFile(pyPath, heroNameInLine);
        deleteFile(destBinPath);
        await runCommand(`E:\\lolsupport\\ritobin\\bin\\ritobin_cli`, pyPath);
        deleteFile(pyPath);
      }
      if (flag) {
        break;
      }
      await packToWad(
        path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`),
        heroName,
        skinId,
        heroId
      );

      ++skinId;
    }
    current++;
  }
  emptyDir(OUTPUT_BASE_DIR);
  emptyDir(EXTRACT_BASE_DIR);
  notifyMsg('\n所有英雄皮肤已按 英雄名/皮肤ID 目录分类完成。');
};
