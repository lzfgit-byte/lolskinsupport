import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Path from 'node:path';
import AdmZip from 'adm-zip';
import { IS_USE_COMMAND, modToolsWrapper } from '../const';
import { LogMsgUtil, MessageUtil, NotifyMsgUtil } from '../utils/message';
import { wadPathHash } from '../utils/wad-hash';
import { extractWadByHash, extractWadSkinBins } from './extract-wad-chunks';
import { readAudioBlocks, type AudioBlocks } from './skin-audio';
import { readSkinMeshRefs, rebaseSkinPy } from './skin-rebase';

// 模拟 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultSkinSuffix = 'leagueSkins';
// --- 配置区 ---
let WAD_SOURCE_DIR = 'E:\\game\\Riot Games\\League of Legends\\Game\\DATA\\FINAL\\Champions';
let EXTRACT_BASE_DIR = 'C:\\Users\\18074\\Downloads\\skins';
let OUTPUT_BASE_DIR = 'C:\\Users\\18074\\Downloads\\skin_out';
let OUTPUT_WAD_BASE_DIR = `C:\\Users\\18074\\Downloads\\${defaultSkinSuffix}`;
let MOD_TOOLS_PATH = 'E:\\lolsupport\\cslol-manager\\cslol-tools';

export const setConfigData = (
  gamePath,
  outBasePath,
  modToolsPath,
  skinSuffix = defaultSkinSuffix
) => {
  WAD_SOURCE_DIR = Path.normalize(`${gamePath}\\DATA\\FINAL\\Champions`);
  EXTRACT_BASE_DIR = Path.normalize(`${outBasePath}\\skins`);
  OUTPUT_BASE_DIR = Path.normalize(`${outBasePath}\\skin_out`);
  OUTPUT_WAD_BASE_DIR = Path.normalize(`${outBasePath}\\${skinSuffix}`);
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

/** 该角色 base 皮肤的身份（championSkinName + 音频段），每个角色只读一次游戏 skin0.bin */
const baseSkinCache = new Map<string, { name: string; audio: AudioBlocks | null }>();

/**
 * 从游戏 WAD 解出来的 skin0.bin 里读 base 皮肤的 championSkinName（如 VayneBase）
 * 和音频身份的两段（tagEventList / bankUnits）。
 *
 * 不能靠拼字符串猜：不同英雄叫法不一样（VayneBase / Jade_VayneBase / AnnieBase…），
 * Rose 的 baseskin 也是从游戏数据里取的。
 */
const readBaseSkinData = async (
  characterDir: string,
  character: string
): Promise<{ name: string; audio: AudioBlocks | null }> => {
  const cached = baseSkinCache.get(character);
  if (cached !== undefined) {
    return cached;
  }
  const baseBin = path.join(characterDir, 'skins', 'skin0.bin');
  if (!fs.existsSync(baseBin)) {
    baseSkinCache.set(character, { name: '', audio: null });
    return { name: '', audio: null };
  }
  try {
    await runCommand(Path.join(MOD_TOOLS_PATH, 'ritobin', 'bin', 'ritobin_cli'), false, baseBin);
    const basePy = baseBin.replace(/\.bin$/, '.py');
    const text = fs.existsSync(basePy) ? fs.readFileSync(basePy, 'utf-8') : '';
    const matched = /championSkinName:\s*string\s*=\s*"([^"]*)"/.exec(text);
    const name = matched ? matched[1] : '';
    const audio = readAudioBlocks(text);
    if (fs.existsSync(basePy)) {
      fs.unlinkSync(basePy);
    }
    logData(
      ` [base-skin] ${character} 的 base 皮肤: ${name || '(没找到)'}` +
        `，音频段 ${audio ? '已读到' : '没读到'}`
    );
    const result = { name, audio };
    baseSkinCache.set(character, result);
    return result;
  } catch (error) {
    logData(` [base-skin] 读取 ${character} base 皮肤数据失败:`, error?.message ?? error);
    const result = { name: '', audio: null };
    baseSkinCache.set(character, result);
    return result;
  }
};

/**
 * 从游戏 WAD 里按路径取出网格/骨架（SKN/SKL）。
 *
 * 生成流程解包用的是 extractWadSkinBins，只拿 `data/characters/<champ>/skins/skin*.bin`，
 * 里面没有 `assets/` 的网格文件 —— 所以这里按路径哈希直接从原 WAD 取。
 */
const extractMeshAssets = async (wadPath: string, refs: string[]): Promise<Map<string, Buffer>> => {
  const assets = new Map<string, Buffer>();
  if (refs.length === 0) {
    return assets;
  }
  const outputDir = path.join(
    os.tmpdir(),
    `lol-skin-mesh-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  try {
    const result = await extractWadByHash({
      wadPath,
      files: refs.map((filePath) => ({ hash: wadPathHash(filePath), filePath })),
      outputDir,
    });
    for (const item of result.files as Array<{
      filePath?: string;
      outputPath?: string;
      error?: string;
    }>) {
      if (item.error || !item.filePath || !item.outputPath || !fs.existsSync(item.outputPath)) {
        logData(` [base-skin] 取网格失败 ${item.filePath ?? ''}: ${item.error ?? '没有输出'}`);
        continue;
      }
      assets.set(item.filePath.replace(/\\/g, '/').toLowerCase(), fs.readFileSync(item.outputPath));
    }
  } catch (error) {
    logData(` [base-skin] 从游戏 WAD 取网格出错:`, error?.message ?? error);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  return assets;
};

const packToWad = async (skinFolderPath, heroName, skinId, heroId) => {
  try {
    // 构建输出的 WAD 文件路径，例如: ...\annie\skin1\1.wad.client
    const wadName = `${heroId}_${skinId}`;
    const outputWadPath = path.join(OUTPUT_WAD_BASE_DIR, `${wadName}.wad.client`);

    // 这里的路径结构必须严格按照 wad-make 的参数要求：
    // 参数1: 要打包的源文件夹路径
    // 参数2: 输出的 WAD 文件路径
    // 注意：路径带空格时务必使用双引号包裹 `${MOD_TOOLS_PATH}\\wad-make.exe`;
    const command = Path.join(MOD_TOOLS_PATH, 'wad-make.exe');

    logData(` [正在封包] 生成 WAD: ${outputWadPath}`);
    await runCommand(command, true, skinFolderPath, outputWadPath);

    await createZipFile(wadName, outputWadPath, heroName, heroId);
    return outputWadPath;
  } catch (err) {
    logData(` [封包失败] ${skinFolderPath}:`, err.message);
  }
};
export const createZipFile = async (wadName, outWadFilePath, heroName, heroId) => {
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
    const zipPath = Path.join(OUTPUT_WAD_BASE_DIR, heroId, `${wadName}.zip`);

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
const doUnpackWadFile = async (
  fullWadPath: string,
  currentExtraPath: string,
  sendPregress = false
) => {
  if (IS_USE_COMMAND) {
    await runCommand(
      Path.join(MOD_TOOLS_PATH, 'wad-extract.exe'),
      sendPregress,
      fullWadPath,
      currentExtraPath
    );
    return;
  }
  await extractWadSkinBins({
    wadPath: fullWadPath,
    hashesPath: Path.join(MOD_TOOLS_PATH, 'hashes.game.txt'),
    outputDir: currentExtraPath,
    logFlag: sendPregress,
  });
};
export const unpackWadFile = async (fullWadPath) => {
  const heroName = getHeroName(fullWadPath);
  const currentExtraPath = Path.join(EXTRACT_BASE_DIR, heroName);
  emptyDir(currentExtraPath);
  await doUnpackWadFile(fullWadPath, currentExtraPath, true);

  logData(` [解压完成] ${fullWadPath}`);
};
export const loadSkinDataByFile = async (
  idNameMap: Record<string, any>,
  fullWadPath: string,
  nameIdMap_?: Record<string, any>,
  currentSkinId = -1,
  cb?: Function
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
  if (!heroId) {
    logData(` [错误] 找不到英雄ID: ${heroName}`);
    MessageUtil.error(` [错误] 找不到英雄ID: ${heroName}`);
    return;
  }
  logData(` [正在解压] ${fullWadPath}`);
  await doUnpackWadFile(fullWadPath, currentExtraPath, false);
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
      // 按 Rose 的方式补 base skin 身份：复制 SKN/SKL 到 base 路径 + 改 championSkinName/骨架引用，
      // 否则 LTK 的 patcher 会把这个皮肤当成 skinhack，整局 overlay 被关掉。
      const baseSkin = await readBaseSkinData(
        path.join(charactersDir, heroNameInLine),
        heroNameInLine
      );
      if (baseSkin.name) {
        const meshRefs = readSkinMeshRefs(pyPath);
        const assets = await extractMeshAssets(fullWadPath, meshRefs);
        const rebase = rebaseSkinPy({
          pyPath,
          character: heroNameInLine,
          baseChampionSkinName: baseSkin.name,
          baseAudio: baseSkin.audio ?? undefined,
          extractRoot: currentExtraPath,
          assets,
          outputRoot: path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`),
          log: logData,
        });
        if (rebase) {
          logData(
            ` [base-skin] 已重建网格: ${rebase.meshes
              .map((item) => `${item.path}(${item.added})`)
              .join(', ')}`
          );
        }
      } else {
        logData(` [base-skin] 跳过 ${heroNameInLine}：没有读到 base 皮肤名`);
      }
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
  logData(`${heroName}_${heroId} 封包完成`);
  emptyDir(currentExtraPath);
  emptyDir(path.join(OUTPUT_BASE_DIR, heroName));
  deleteDir(currentExtraPath);
  deleteDir(path.join(OUTPUT_BASE_DIR, heroName));
  cb && cb(heroName, heroId);
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
  const notifyKey = new Date().getTime();
  let count = 0;
  while (wadFiles.length > 0) {
    const sTime = Date.now();
    const wadList = wadFiles.splice(0, wadFiles.length > chunkSize ? chunkSize : wadFiles.length);
    await Promise.all(
      wadList.map((wadFile) =>
        loadSkinDataByFile(
          idNameMap,
          Path.join(WAD_SOURCE_DIR, wadFile),
          nameIdMap,
          -1,
          (heroName: string) => {
            NotifyMsgUtil.sendNotifyMsg(
              `[处理完成_${heroName}] ${++count} / ${wadFiles.length} `,
              '',
              `${notifyKey}`
            );
          }
        )
      )
    );
    const endTime = Date.now();
    logData(
      `【重要】 ${++count} / ${wadFiles.length} 个 WAD，本轮循环耗时 ${(endTime - sTime) / 1000} 秒`
    );
  }
  logData('所有英雄皮肤已按 英雄名/皮肤ID 目录分类完成。');
};
