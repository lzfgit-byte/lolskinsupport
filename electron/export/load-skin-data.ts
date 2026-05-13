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
let MOD_TOOLS_PATH = 'E:\\lolsupport\\cslol-manager\\cslol-tools';

export const setConfigData = (gamePath, outBasePath, modToolsPath) => {
  WAD_SOURCE_DIR = Path.normalize(`${gamePath}\\DATA\\FINAL\\Champions`);
  EXTRACT_BASE_DIR = Path.normalize(`${outBasePath}\\skins`);
  OUTPUT_BASE_DIR = Path.normalize(`${outBasePath}\\skin_out`);
  OUTPUT_WAD_BASE_DIR = Path.normalize(`${outBasePath}\\${SKIN_DEFAULT_SUFFIX}`);
  MOD_TOOLS_PATH = Path.join(modToolsPath, '..');
};

const logData = (msg: string, ...data: any[]) => {
  console.log(msg, ...data);
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
const deleteDir = (path) => {
  try {
    fs.rmdirSync(path);
    console.log('文件夹已异步删除');
  } catch (err) {
    console.error('删除出错:', err);
  }
};
/**
 * 执行系统命令
 */
const runCommand = async (command: string, sendPregress = true, ...args: any[]) => {
  await modToolsWrapper.execToolWithTimeout(command, args, 50000, sendPregress).catch((msg) => {
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

const patchPyFile = (heroName: string, pyPath: string, skinId: any) => {
  if (!fs.existsSync(pyPath)) {
    return;
  }
  let replaceData = `"Characters/${heroName}/Skins/Skin0"`;
  let resource = `"Characters/${heroName}/Skins/Skin0/Resources"`;
  try {
    let content = fs.readFileSync(pyPath, 'utf-8');
    const lines = content.split('\n');
    const processedLines = lines.map((line) => {
      // 1. 匹配 SkinCharacterDataProperties
      // 逻辑：替换 = 号前面的内容，保留缩进
      if (line.includes('SkinCharacterDataProperties') && line.includes('=')) {
        // 正则匹配：(缩进)(任意内容)=(剩余部分)
        const res = line.replace(line.split('=')[0].trim(), replaceData);
        logData(`SkinCharacterDataProperties 替换 |${line}| -> |${res}|`);
        return res;
      }

      // 2. 匹配 mResourceResolver
      // 逻辑：替换 = 号后面的内容
      if (line.includes('mResourceResolver') && line.includes('=')) {
        const res = line.replace(line.split('=')[1].trim(), resource);
        logData(`mResourceResolver 替换 |${line}| -> |${res}|`);
        return res;
      }

      // 3. 匹配 包含 ResourceResolver 但不是 mResourceResolver 的行（或根据你要求的通用匹配）
      // 逻辑：替换 = 号前面的内容
      if (
        line.includes('ResourceResolver') &&
        !line.includes('mResourceResolver') &&
        !line.includes('pointer') &&
        line.includes('=')
      ) {
        const res = line.replace(line.split('=')[0].trim(), resource);
        logData(`ResourceResolver 替换 |${line}| -> |${res}|`);
        return res;
      }
      return line;
    });

    fs.writeFileSync(pyPath, processedLines.join('\n'), 'utf-8');
    logData(`${heroName}_${skinId}_${pyPath} --> 修改结束`);
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
    // 注意：路径带空格时务必使用双引号包裹 `${MOD_TOOLS_PATH}\\wad-make.exe`;
    const command = Path.join(MOD_TOOLS_PATH, 'wad-make.exe');

    logData(` [正在封包] 生成 WAD: ${outputWadPath}`);
    await runCommand(command, true, skinFolderPath, outputWadPath);

    await createZipFile(wadName, outputWadPath, heroName);
    return outputWadPath;
  } catch (err) {
    logData(` [封包失败] ${skinFolderPath}:`, err.message);
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
const getHeroName = (fullWadPath: string) => {
  return path.basename(fullWadPath, path.extname(fullWadPath)).split('.')[0];
};
export const unpackWadFile = async (fullWadPath) => {
  const heroName = getHeroName(fullWadPath);
  const currentExtraPath = Path.join(EXTRACT_BASE_DIR, heroName);
  emptyDir(currentExtraPath);
  await runCommand(
    Path.join(MOD_TOOLS_PATH, 'wad-extract.exe'),
    true,
    fullWadPath,
    currentExtraPath
  );
  logData(` [解压完成] ${fullWadPath}`);
};
export const loadSkinDataByFile = async (
  idNameMap: Record<string, any>,
  fullWadPath: string,
  nameIdMap_?: Record<string, any>,
  currentSkinId = -1,
  logPrefix = ''
) => {
  if (!fs.existsSync(fullWadPath)) {
    MessageUtil.error(`文件不存在: ${fullWadPath}`);
    return;
  }
  const heroName = getHeroName(fullWadPath);
  const currentExtraPath = Path.join(EXTRACT_BASE_DIR, heroName);
  const currentOutPutBaseDir = Path.join(OUTPUT_BASE_DIR, heroName);
  emptyDir(currentExtraPath);
  emptyDir(currentOutPutBaseDir);
  const nameIdMap = nameIdMap_ || {};
  if (!nameIdMap_) {
    Object.keys(idNameMap).forEach((key: string) => {
      nameIdMap[idNameMap[key]] = key;
    });
  }

  const heroId = nameIdMap[heroName];
  // 3. 解压当前 WAD `E:\\lolsupport\\cslol-manager\\cslol-tools\\wad-extract.exe`,
  logData(` [正在解压] ${fullWadPath}`);
  await runCommand(
    Path.join(MOD_TOOLS_PATH, 'wad-extract.exe'),
    false,
    fullWadPath,
    currentExtraPath
  );
  logData(` [解压完成] ${fullWadPath}`);
  // 4. 定位英雄目录 (data/characters/XXXX)
  const charactersDir = path.join(currentExtraPath, 'data', 'characters');
  if (!fs.existsSync(charactersDir)) {
    logData(`跳过: 内部不含 characters 目录`);
    return;
  }
  const heroes = fs.readdirSync(charactersDir).filter((f) => {
    return fs.statSync(path.join(charactersDir, f)).isDirectory();
  });
  // 获取该 WAD 里的英雄名（如 annie）
  let skinId = Math.max(currentSkinId, 0);
  while (true) {
    let flag = false;
    const trueHeros = heroes.filter((item) => {
      return item.toUpperCase() === heroName.toUpperCase();
    })[0];
    const notifyKey = new Date().getTime();
    const findNextSkinId = (skinsDir: string, skinId: number, offset = 50) => {
      while (offset > 0) {
        let binFileName = `skin${skinId}.bin`;
        let sourceBinPath = path.join(skinsDir, binFileName);
        if (fs.existsSync(sourceBinPath)) {
          return { binFileName, sourceBinPath, skinId_: skinId };
        }
        NotifyMsgUtil.sendNotifyMsg('[发现跨id皮肤]', sourceBinPath, `${notifyKey}`);
        offset--;
        skinId++;
      }
      let binFileName = `skin${skinId}.bin`;
      let sourceBinPath = path.join(skinsDir, binFileName);
      return { binFileName, sourceBinPath, skinId_: skinId };
    };
    const trueHerosDir = path.join(charactersDir, trueHeros, 'skins');
    const allFilesLength = fs.readdirSync(trueHerosDir).length;
    const { sourceBinPath, skinId_ } = findNextSkinId(trueHerosDir, skinId, 50);
    skinId = skinId_;
    if (!fs.existsSync(sourceBinPath)) {
      break;
    }
    for (const heroNameInLine of heroes) {
      const skinsDir = path.join(charactersDir, heroNameInLine, 'skins');
      let binFileName = `skin${skinId}.bin`;
      let sourceBinPath = path.join(skinsDir, binFileName);
      if (!fs.existsSync(skinsDir)) {
        continue;
      }
      // 5. 递增探测 SkinId
      // 如果找不到当前 ID 的文件，跳出循环去处理下一个英雄
      if (!fs.existsSync(sourceBinPath)) {
        continue;
      }
      logData(` [正在处理] 英雄名字 ${heroName} ${heroNameInLine} 皮肤id ${skinId}`);
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
      logData(` [复制完成] ${sourceBinPath} -> ${destBinPath}`);

      // 调用全局 ritobin_cli 自动解出 .py`E:\\lolsupport\\ritobin\\bin\\ritobin_cli`
      await runCommand(
        Path.join(MOD_TOOLS_PATH, 'ritobin', 'bin', 'ritobin_cli'),
        true,
        destBinPath
      );
      logData(` [解包完成 ritobin]  ${destBinPath}`);
      const pyPath = destBinPath.replace('.bin', '.py');
      patchPyFile(heroNameInLine, pyPath, skinId);
      logData(` [处理完成 py文件修改] ${pyPath}`);
      deleteFile(destBinPath);
      await runCommand(Path.join(MOD_TOOLS_PATH, 'ritobin', 'bin', 'ritobin_cli'), true, pyPath);
      logData(` [封包完成 ritobin] ${pyPath}`);
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
    if (currentSkinId > -1) {
      break;
    }
    logData(`已处理皮肤id ：${skinId} / ${allFilesLength}`);
    skinId++;
  }
  logData(`${logPrefix} 封包完成`);
  emptyDir(currentExtraPath);
  emptyDir(path.join(OUTPUT_BASE_DIR, heroName));
  deleteDir(currentExtraPath);
  deleteDir(path.join(OUTPUT_BASE_DIR, heroName));
};
export const loadSkinData = async (idNameMap: Record<string, any>, chunkSize = 20) => {
  // 1. 初始化提取目录
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
  logData(`开始构建皮肤数据...分片数：${chunkSize} 文件总数：${wadFiles.length}`);
  while (true) {
    const sTime = Date.now();
    const wadList = wadFiles.splice(0, wadFiles.length > chunkSize ? chunkSize : wadFiles.length);
    await Promise.all(
      wadList.map((wadFile) =>
        loadSkinDataByFile(
          idNameMap,
          Path.join(WAD_SOURCE_DIR, wadFile),
          nameIdMap,
          -1,
          `【重要】剩余文件数${wadFiles.length}`
        )
      )
    );
    const endTime = Date.now();
    logData(
      `【重要】已处理 ${wadList.length} 个 WAD 文件,剩余${wadFiles.length} 个 WAD，耗时 ${
        (endTime - sTime) / 1000
      } 秒`
    );
    if (wadList.length === 0) {
      break;
    }
  }
  logData('所有英雄皮肤已按 英雄名/皮肤ID 目录分类完成。');
};
