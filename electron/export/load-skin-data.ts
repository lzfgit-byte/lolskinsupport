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
import { extractWadByHash, extractWadFiles, extractWadSkinBins } from './extract-wad-chunks';
import { readAudioBlocks, type AudioBlocks } from './skin-audio';
import { binsToPyCall, convertBinsToPy, pyToBinsCall, ritobinToolPath } from './ritobin';
import { resolveSkinBinIndexPath } from '../utils/tools-path';
import { discoverWadSkinBins } from './wad-index';
import {
  collectBankPaths,
  collectVoiceBankPaths,
  createSidecarRegistry,
  flushSidecars,
  planBankAliases,
} from './skin-banks';
import { findCaseInsensitive, readSkinMeshRefs, rebaseSkinPy } from './skin-rebase';
import { checkSkinNames, describeSkinCheck, writeSkinCheck } from './skin-check';

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

/**
 * 自动构建时的日志改道：默认发到页面日志抽屉，设置 sink 后只发给构建窗口。
 * 这样「没皮肤就自动构建」不会把页面日志刷满。
 */
let buildLogSink: ((message: string) => void) | null = null;

export const setBuildLogSink = (sink: ((message: string) => void) | null) => {
  buildLogSink = sink;
};

const logData = (msg: string, ...data: any[]) => {
  console.log(msg, ...data);
  if (buildLogSink) {
    const extra = data
      .filter((item) => item !== undefined && item !== null && `${item}`.length > 0)
      .map((item) => `${item}`)
      .join(' ');
    buildLogSink(extra ? `${msg} ${extra}` : msg);
    return;
  }
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
 *
 * `prefetchedPy` 是批量解包时已经转好的 py（省掉一次 3 秒的 ritobin 启动）。
 */
const readBaseSkinData = async (
  baseBinPath: string,
  character: string,
  prefetchedPy?: string
): Promise<{ name: string; audio: AudioBlocks | null }> => {
  const cached = baseSkinCache.get(character);
  if (cached !== undefined) {
    return cached;
  }
  let basePy: string | null = null;
  try {
    if (prefetchedPy && fs.existsSync(prefetchedPy)) {
      basePy = prefetchedPy;
    } else if (fs.existsSync(baseBinPath)) {
      const call = binsToPyCall(baseBinPath);
      await runCommand(call.command, false, ...call.args);
      basePy = baseBinPath.replace(/\.bin$/, '.py');
    }
    if (!basePy || !fs.existsSync(basePy)) {
      baseSkinCache.set(character, { name: '', audio: null });
      return { name: '', audio: null };
    }
    const text = fs.readFileSync(basePy, 'utf-8');
    const matched = /championSkinName:\s*string\s*=\s*"([^"]*)"/.exec(text);
    const name = matched ? matched[1] : '';
    const audio = readAudioBlocks(text);
    if (!prefetchedPy) {
      fs.rmSync(basePy, { force: true });
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
 * 从游戏 WAD 里按路径取出若干文件（网格、骨架、声音 bank）。
 *
 * 生成流程解包用的是 extractWadSkinBins，只拿 `data/characters/<champ>/skins/skin*.bin`，
 * 里面没有 `assets/` 下的文件 —— 所以这里按路径哈希直接从原 WAD 取；如果解包目录里
 * 已经有（`IS_USE_COMMAND` 走 wad-extract.exe 时会有），直接读磁盘。
 */
const extractWadAssets = async (
  wadPath: string,
  refs: string[],
  extractRoot?: string,
  label = '资源',
  quiet = false
): Promise<Map<string, Buffer>> => {
  const assets = new Map<string, Buffer>();
  const wanted: string[] = [];
  for (const ref of refs) {
    if (assets.has(ref.toLowerCase())) {
      continue;
    }
    const local = extractRoot ? findCaseInsensitive(extractRoot, ref) : null;
    if (local) {
      assets.set(ref.replace(/\\/g, '/').toLowerCase(), fs.readFileSync(local));
      continue;
    }
    wanted.push(ref);
  }
  if (wanted.length === 0) {
    return assets;
  }
  const outputDir = path.join(
    os.tmpdir(),
    `lol-skin-assets-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  try {
    const result = await extractWadByHash({
      wadPath,
      files: wanted.map((filePath) => ({ hash: wadPathHash(filePath), filePath })),
      outputDir,
    });
    for (const item of result.files as Array<{
      filePath?: string;
      outputPath?: string;
      error?: string;
    }>) {
      if (item.error || !item.filePath || !item.outputPath || !fs.existsSync(item.outputPath)) {
        if (!quiet) {
          logData(` [base-skin] 取${label}失败 ${item.filePath ?? ''}: ${item.error ?? '没有输出'}`);
        }
        continue;
      }
      assets.set(item.filePath.replace(/\\/g, '/').toLowerCase(), fs.readFileSync(item.outputPath));
    }
  } catch (error) {
    if (!quiet) {
      logData(` [base-skin] 从游戏 WAD 取${label}出错:`, error?.message ?? error);
    }
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  return assets;
};

/**
 * 从英雄 WAD 旁边的语言 WAD（`<英雄>.zh_CN.wad.client` 之类）里取文件。
 *
 * 语音 bank 只在语言 WAD 里；各个语言的事件/Action 是一样的，所以找到一份就够。
 */
const extractWadAssetsFromLocales = async (
  wadPath: string,
  refs: string[],
  label = '语音 bank'
): Promise<Map<string, Buffer>> => {
  const assets = new Map<string, Buffer>();
  if (refs.length === 0) {
    return assets;
  }
  const directory = path.dirname(wadPath);
  const stem = path.basename(wadPath).replace(/\.wad\.client$/i, '');
  let candidates: string[] = [];
  try {
    candidates = fs
      .readdirSync(directory)
      .filter((name) =>
        new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[A-Za-z]{2}_[A-Za-z]{2}\\.wad\\.client$`, 'i').test(
          name
        )
      )
      .sort((left, right) => {
        // 中文客户端优先：文件一定在，读起来最省事
        const leftZh = /zh_CN/i.test(left) ? 0 : 1;
        const rightZh = /zh_CN/i.test(right) ? 0 : 1;
        return leftZh - rightZh || left.localeCompare(right);
      })
      .map((name) => path.join(directory, name));
  } catch {
    candidates = [];
  }
  let pending = refs.slice();
  for (const candidate of candidates) {
    if (pending.length === 0) {
      break;
    }
    const found = await extractWadAssets(candidate, pending, undefined, label, true);
    for (const [key, value] of found) {
      assets.set(key, value);
    }
    pending = pending.filter((ref) => !assets.has(ref.replace(/\\/g, '/').toLowerCase()));
  }
  if (pending.length > 0) {
    logData(` [base-skin] 语言 WAD 里还差 ${pending.length} 个${label}：${pending.join(', ')}`);
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
/**
 * 准备好这个 WAD 里要用的 bin。
 *
 * `targeted` 为真时先试「定向解包」：只按路径哈希取 `data/characters/<角色>/skins/skin<n>.bin`
 * （几十 KB，实测 50 ms），失败再退回全量解包（wad-extract.exe 要解 144 MB）。
 * 生成皮肤走定向解包；「把 WAD 拆开看一眼」那种工具函数仍然全量解包。
 */
const doUnpackWadFile = async (
  fullWadPath: string,
  currentExtraPath: string,
  sendPregress = false,
  wantedSkinIds?: number[],
  targeted = false
) => {
  if (targeted) {
    const startedAt = Date.now();
    try {
      const entries = await discoverWadSkinBins({
        wadPath: fullWadPath,
        skinBinIndexPath: resolveSkinBinIndexPath(MOD_TOOLS_PATH),
        log: sendPregress ? logData : undefined,
      });
      if (entries.length > 0) {
        // base 皮肤（skin0）要留着读身份/音频，其余只取这次要生成的皮肤
        const wanted =
          wantedSkinIds && wantedSkinIds.length > 0
            ? entries.filter(
                (entry) =>
                  /\/skin0\.bin$/.test(entry.filePath) ||
                  wantedSkinIds.some((id) => entry.filePath.endsWith(`/skin${id}.bin`))
              )
            : entries;
        const result = await extractWadFiles({
          wadPath: fullWadPath,
          files: wanted,
          outputDir: currentExtraPath,
        });
        if (result.success) {
          logData(
            ` [定向解包] ${wanted.length}/${entries.length} 个皮肤 bin，` +
              `用时 ${Date.now() - startedAt} ms`
          );
          return;
        }
        logData(' [定向解包] 有文件没取到，退回全量解包');
      } else {
        // 索引是随包带的静态文件，游戏更新出了新英雄/新皮肤后要重新生成
        logData(
          ` [定向解包] ${Path.basename(fullWadPath)} 不在皮肤索引里` +
            '（索引可能过期：npm run index:gen）'
        );
      }
    } catch (error) {
      logData(` [定向解包] 失败，退回全量解包: ${error?.message ?? error}`);
    }
  }

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
    skinBinIndexPath: resolveSkinBinIndexPath(MOD_TOOLS_PATH),
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
  cb?: Function,
  /** 构建进度回调（0~100 + 当前阶段说明），给构建窗口用 */
  onProgress?: (percent: number, message: string) => void
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
  await doUnpackWadFile(
    fullWadPath,
    currentExtraPath,
    false,
    currentSkinId > -1 ? [currentSkinId] : undefined,
    true
  );
  logData(` [解压完成] ${fullWadPath}`);
  onProgress?.(15, '解包完成');
  // 4. 定位英雄目录 (data/characters/XXXX)
  const charactersDir = path.join(currentExtraPath, 'data', 'characters');
  if (!fs.existsSync(charactersDir)) {
    logData(` [错误] 没有解出任何皮肤 bin：皮肤索引可能过期，先运行 npm run index:gen`);
    return;
  }
  const heroes = fs.readdirSync(charactersDir).filter((f) => {
    return fs.statSync(path.join(charactersDir, f)).isDirectory();
  });
  // 获取该 WAD 里的英雄名（如 annie）
  let skinId = Math.max(currentSkinId, 0);
  // 每个皮肤生成后做一次 LTK 名字检查（只查 WAD 同名角色，和 patcher 的检查范围一致）
  let checkChampion = '';
  let checkProblems: ReturnType<typeof checkSkinNames> = [];
  while (true) {
    let flag = false;
    checkChampion = '';
    checkProblems = [];
    const trueHeros = heroes.filter((item) => {
      return item.toUpperCase() === heroName.toUpperCase();
    })[0];
    const notifyKey = new Date().getTime();
    const findNextSkinId = (skinsDir: string, startId: number, offset = 50) => {
      let current = startId;
      while (offset > 0) {
        const binFileName = `skin${current}.bin`;
        const sourceBinPath = path.join(skinsDir, binFileName);
        if (fs.existsSync(sourceBinPath)) {
          return { binFileName, sourceBinPath, skinId_: current };
        }
        offset--;
        current++;
      }
      const binFileName = `skin${current}.bin`;
      const sourceBinPath = path.join(skinsDir, binFileName);
      // 跨 id 时只提示一次，不要每跳一个 id 弹一张通知
      if (current !== startId) {
        NotifyMsgUtil.sendNotifyMsg('[发现跨id皮肤]', sourceBinPath, `${notifyKey}`);
      }
      return { binFileName, sourceBinPath, skinId_: current };
    };
    const trueHerosDir = path.join(charactersDir, trueHeros, 'skins');
    const allFilesLength = fs.readdirSync(trueHerosDir).length;
    const { sourceBinPath, skinId_ } = findNextSkinId(trueHerosDir, skinId, 50);
    skinId = skinId_;
    if (!fs.existsSync(sourceBinPath)) {
      // 批量模式（currentSkinId = -1）走到这里就是正常结束；单个皮肤找不到才是异常
      if (currentSkinId > 0) {
        logData(` [未找到] ${heroName} 的 skin${currentSkinId}（往上找了 50 个 id 都没有 bin）`);
        logData(' [提示] 新皮肤可能还没进随包索引：npm run index:gen 重新生成后重试');
      }
      break;
    }

    // 一次批量把「本皮肤 + base 皮肤」的 bin 转成 py：
    // 一个皮肤里几个角色加起来 4~8 个 bin，逐个起进程要 8 × 150 ms，批量一次就够
    const ritobinWork = path.join(OUTPUT_BASE_DIR, heroName, '_ritobin', `skin${skinId}`);
    fs.rmSync(ritobinWork, { recursive: true, force: true });
    const skinPyOf = new Map<string, string>();
    const basePyOf = new Map<string, string>();
    for (const heroNameInLine of heroes) {
      const characterSkinsDir = path.join(charactersDir, heroNameInLine, 'skins');
      const skinBin = path.join(characterSkinsDir, `skin${skinId}.bin`);
      if (!fs.existsSync(skinBin)) {
        continue;
      }
      const skinWork = path.join(ritobinWork, 'skin', heroNameInLine);
      fs.mkdirSync(skinWork, { recursive: true });
      fs.copyFileSync(skinBin, path.join(skinWork, `skin${skinId}.bin`));
      skinPyOf.set(heroNameInLine, path.join(skinWork, `skin${skinId}.py`));

      const baseBin = path.join(characterSkinsDir, 'skin0.bin');
      if (fs.existsSync(baseBin)) {
        const baseWork = path.join(ritobinWork, 'base', heroNameInLine);
        fs.mkdirSync(baseWork, { recursive: true });
        fs.copyFileSync(baseBin, path.join(baseWork, 'skin0.bin'));
        basePyOf.set(heroNameInLine, path.join(baseWork, 'skin0.py'));
      }
    }
    const ritobinRunner = (args: string[]) =>
      runCommand(ritobinToolPath(), false, ...args);
    if (skinPyOf.size > 0) {
      const converted = await convertBinsToPy(ritobinRunner, ritobinWork, logData);
      logData(
        ` [ritobin] 批量解包 ${converted.count} 个 bin，用时 ${converted.elapsedMs} ms` +
          `${converted.slimHashes ? '（精简名字表）' : '（默认名字表）'}`
      );
    }
    onProgress?.(35, 'bin 转换完成');

    // 一份皮肤里几个角色（vayne / jade_vayne）共用语音 bank，sidecar 要累计它们
    const sidecarRegistry = createSidecarRegistry();
    const inLineNames = Array.from(skinPyOf.keys());
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
      const lineIndex = Math.max(0, inLineNames.indexOf(heroNameInLine));
      const lineCount = Math.max(1, inLineNames.length);
      onProgress?.(45 + Math.round((lineIndex / lineCount) * 40), `改写 ${heroNameInLine}`);
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

      // 7. 直接用批量转换好的 py（bin 不再复制，也不再单独起 ritobin）
      const pyPath = path.join(targetSkinDir, 'skin0.py');
      const preparedPy = skinPyOf.get(heroNameInLine);
      if (!preparedPy || !fs.existsSync(preparedPy)) {
        logData(` [跳过] ${heroNameInLine} skin${skinId} 没有预转换的 py`);
        continue;
      }
      fs.copyFileSync(preparedPy, pyPath);
      logData(` [复制完成] ${preparedPy} -> ${pyPath}`);
      patchPyFile(heroNameInLine, pyPath, skinId);
      logData(` [处理完成 py文件修改] ${pyPath}`);
      // 按 Rose 的方式补 base skin 身份：复制 SKN/SKL 到 base 路径 + 改 championSkinName/骨架引用，
      // 否则 LTK 的 patcher 会把这个皮肤当成 skinhack，整局 overlay 被关掉。
      const baseSkin = await readBaseSkinData(
        path.join(charactersDir, heroNameInLine, 'skins', 'skin0.bin'),
        heroNameInLine,
        basePyOf.get(heroNameInLine)
      );
      if (baseSkin.name) {
        const packDir = path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`);
        const meshRefs = readSkinMeshRefs(pyPath);
        const assets = await extractWadAssets(fullWadPath, meshRefs, currentExtraPath, '网格');

        // 音效别名：把皮肤 bank 里的事件补上 base 名字的别名，保住皮肤自己的音效。
        // 拿不到 bank / 没有可合并的 tag 时，退回「整段换成 base 皮肤语音」。
        let audioBlocks = baseSkin.audio ?? undefined;
        if (baseSkin.audio) {
          const pyText = fs.readFileSync(pyPath, 'utf-8');
          const bankRefs = collectBankPaths(pyText, baseSkin.audio);
          const voiceRefs = collectVoiceBankPaths(pyText);
          const bankBytes = await extractWadAssets(fullWadPath, bankRefs, currentExtraPath, 'bank');
          const voiceBytes = await extractWadAssetsFromLocales(fullWadPath, voiceRefs);
          for (const [key, value] of voiceBytes) {
            bankBytes.set(key, value);
          }
          const plan = await planBankAliases({
            pyText,
            character: heroNameInLine,
            baseAudio: baseSkin.audio,
            sidecars: sidecarRegistry,
            readBank: async (bankPath) =>
              bankBytes.get(bankPath.replace(/\\/g, '/').toLowerCase()) ?? null,
            log: logData,
          });
          if (plan) {
            audioBlocks = plan.blocks;
            for (const file of plan.files) {
              const target = path.join(packDir, file.path);
              fs.mkdirSync(path.dirname(target), { recursive: true });
              fs.writeFileSync(target, file.data);
            }
            logData(
              ` [base-skin] ${heroNameInLine}: 音效别名 ${plan.aliasedEvents} 个` +
                `，语音别名 ${plan.voiceAliases} 个（${plan.voiceUnits.join(', ') || '无'}）` +
                `${plan.missingEvents > 0 ? `，${plan.missingEvents} 个事件在 bank 里找不到` : ''}` +
                `，单位 ${plan.renamedUnits.map((unit) => `${unit.from}->${unit.to}`).join(', ') || '不改名'}` +
                `，随包 bank ${plan.files.length} 个`
            );
            for (const note of plan.notes.slice(0, 5)) {
              logData(` [base-skin] ${heroNameInLine}: ${note}`);
            }
          } else {
            logData(` [base-skin] ${heroNameInLine}: 补不了音效/语音别名，音频整段换成 base 皮肤的`);
          }
        }

        const rebase = rebaseSkinPy({
          pyPath,
          character: heroNameInLine,
          baseChampionSkinName: baseSkin.name,
          baseAudio: audioBlocks,
          extractRoot: currentExtraPath,
          assets,
          outputRoot: packDir,
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
      // LTK 的 patcher 只查与 WAD 同名的角色目录里的 skin0.bin，这里跟着查一遍：
      // 名字没换干净（比如状态类事件）包能生成，但一进游戏 overlay 就被关掉。
      // 纯字符串扫描，几毫秒；结果写到 zip 旁边，注入前读它。
      if (heroNameInLine.toLowerCase() === heroName.toLowerCase() && fs.existsSync(pyPath)) {
        checkChampion = heroName;
        checkProblems = checkSkinNames({
          text: fs.readFileSync(pyPath, 'utf-8'),
          champion: heroName,
          base: baseSkin.name
            ? { championSkinName: baseSkin.name, audio: baseSkin.audio }
            : undefined,
        });
        logData(
          checkProblems.length === 0
            ? ` [检查] ${heroId}_${skinId} 通过 LTK 名字检查`
            : ` [检查] ${heroId}_${skinId} 会被 LTK 判 skinhack（${checkProblems.length} 处）：` +
                describeSkinCheck({ problems: checkProblems })
        );
      }
      const packCall = pyToBinsCall(pyPath);
      await runCommand(packCall.command, true, ...packCall.args);
      logData(` [封包完成 ritobin] ${pyPath}`);
      deleteFile(pyPath);
      onProgress?.(
        45 + Math.round(((lineIndex + 1) / lineCount) * 40),
        `${heroNameInLine} 改写完成`
      );
    }
    // 批量解包用的工作目录用完就删（里面是 bin/py 副本）
    fs.rmSync(ritobinWork, { recursive: true, force: true });
    // 所有角色的语音别名攒在 registry 里，最后统一写成 sidecar bank
    const sidecarFiles = flushSidecars(sidecarRegistry);
    if (sidecarFiles.length > 0) {
      const sidecarDir = path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`);
      for (const file of sidecarFiles) {
        const target = path.join(sidecarDir, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.data);
      }
      logData(
        ` [base-skin] 语音 sidecar ${sidecarFiles.length} 个: ` +
          sidecarFiles.map((file) => `${file.path}(${file.aliases})`).join(', ')
      );
    }
    if (flag) {
      break;
    }
    onProgress?.(90, '打包中');
    await packToWad(
      path.join(OUTPUT_BASE_DIR, heroName, `skin${skinId}`),
      heroName,
      skinId,
      heroId
    );
    // 检查结果写在 zip 旁边：注入前 `injectSkin` 读它，不通过就不加载
    const zipPath = path.join(OUTPUT_WAD_BASE_DIR, heroId, `${heroId}_${skinId}.zip`);
    if (fs.existsSync(zipPath)) {
      writeSkinCheck(zipPath, {
        ok: checkProblems.length === 0,
        champion: checkChampion || heroName,
        checkedAt: new Date().toISOString(),
        problems: checkProblems,
      });
    }
    onProgress?.(
      100,
      checkProblems.length === 0 ? '构建完成' : '构建完成（未通过 LTK 检查，注入会被拦住）'
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
