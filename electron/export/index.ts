import fs, { appendFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import Path from 'node:path';
import { dialog, shell } from 'electron';
import { ensureFileSync, existsSync, writeFileSync } from 'fs-extra';
import {
  GAME_PATH,
  HERO_SKIN,
  INSTALLED_PATH,
  MOD_TOOLS_PATH,
  OVERLAY_CONFIG_PATH,
  OVERLAY_PATH,
  SCREENSHOT_PATH,
  SKIN_PATH,
} from '@ghs/constant';
import type { ShowSliderConfirmType } from '@ghs/constant';
import {
  IS_USE_COMMAND,
  SKIN_IMAGE_KEY,
  configPath,
  defaultGamePath,
  defaultInstalledPath,
  defaultOverlayConfigPath,
  defaultOverlayPath,
  defaultScreenshotPath,
  defaultSkinPath,
  modToolsWrapper,
  setUseCommand,
  tempPath,
} from '../const';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import { showSliderConfirm } from '../hooks/use-confirm-window';
import { closeBuildWindow, showBuildWindow, updateBuildWindow } from '../hooks/build-window';
import { lcuConnector } from '../http/lcuConnector';
import { patchJsonConfig, readJsonConfig } from '../utils/json-config';
import {
  loadSkinData,
  loadSkinDataByFile,
  setBuildLogSink,
  setConfigData,
  unpackWadFile,
} from './load-skin-data';
import { getToolsEnvStatus } from './tools-env';
import { blockedSkinCheck, describeSkinCheck, readSkinCheck } from './skin-check';
import { isManagedToolsPath, resolveToolsDir } from '../utils/tools-path';
import { toSkinIndex as resolveSkinIndex } from './skin-id';
import { ltfInjector } from './ltfSession';
import { importLeagueSkinsFromFolder, importLeagueSkinsFromZip } from './league-skins-import';
import {
  getSkinSyncState,
  setSkinSyncSettings,
  syncSkinsNow,
  testSkinSyncProxy,
} from './skin-sync';

export * from '../http';
export * from './locale-watcher';
export * from './launch-game';
export * from './lol-data';
export * from './match-history';
export * from './remote-cache';
export * from '../utils/screenshot-config';

// 皮肤自动同步（IPC 名称要和这里导出的函数名一致）
export { getSkinSyncState, setSkinSyncSettings, syncSkinsNow, testSkinSyncProxy };
const idName = {};
const SKIN_DEFAULT_SUFFIX_CONFIG_KEY = 'SKIN_DEFAULT_SUFFIX';
const defaultSkinSuffix = 'leagueSkins';
export const setIdName = (heroList: any[]) => {
  setConfigData(getGamePath(), getSkinPath(), getModToolsPath(), getSkinDefaultSuffix());
  heroList?.forEach((item) => {
    idName[item.heroId] = item.alias;
  });
  LogMsgUtil.sendLogMsg(tempPath);
};
export const loadSkinDataIdName = async (chuckSize = 20) => {
  setConfigData(getGamePath(), getSkinPath(), getModToolsPath(), getSkinDefaultSuffix());
  await loadSkinData(idName, chuckSize);
};
export const loadSkinDataByFilePath = async (fullWadPath: string, current = -1) => {
  setConfigData(getGamePath(), getSkinPath(), getModToolsPath(), getSkinDefaultSuffix());
  await loadSkinDataByFile(idName, fullWadPath, null, current);
};

/** 工具环境状态：关键工具齐不齐、工具目录在哪（工具随安装包走，不需要手动初始化） */
export const getToolsEnvState = () => getToolsEnvStatus();

/**
 * 皮肤列表里的 id 是「英雄 id + 序号」（`59` + `59005`），生成皮肤要的是序号（`5`，
 * 对应游戏里的 `skin5.bin`）。换算在 `skin-id.ts`，这里和 `buildSkinPath()` 共用。
 */
const toSkinIndex = (heroId: string, skinId: string): number =>
  resolveSkinIndex(`${heroId}`, `${skinId}`);

/**
 * 「没有皮肤就直接构建」用：后台静默构建一个皮肤包。
 *
 * 页面日志抽屉不动（`setBuildLogSink` 把日志改道到构建窗口），进度和结果都发到
 * 侧边通知；已经有包时直接返回。
 */
export const autoBuildSkin = async (wadPath: string, heroId: string, skinId: string) => {
  setConfigData(getGamePath(), getSkinPath(), getModToolsPath(), getSkinDefaultSuffix());
  const skinPath = buildSkinPath(`${heroId}`, `${skinId}`);
  if (existsSync(skinPath)) {
    // 上次生成没通过 LTK 检查（可能是旧版本留下的包）：重新生成一次
    const check = readSkinCheck(skinPath);
    if (!check || check.ok) {
      return { ok: true, existed: true, path: skinPath };
    }
    LogMsgUtil.sendLogMsg(`[检查] ${skinPath} 上次没过 LTK 检查，重新生成`);
  }
  if (!wadPath || !existsSync(wadPath)) {
    const error = `找不到英雄 WAD：${wadPath}`;
    showBuildWindow('构建皮肤');
    updateBuildWindow({ state: 'error', percent: 100, message: '找不到英雄 WAD', detail: error });
    return { ok: false, existed: false, path: skinPath, error };
  }
  const skinIndex = toSkinIndex(`${heroId}`, `${skinId}`);
  if (!Number.isFinite(skinIndex) || skinIndex < 0) {
    const error = `皮肤 id 解析失败：heroId=${heroId} skinId=${skinId}`;
    showBuildWindow('构建皮肤');
    updateBuildWindow({ state: 'error', percent: 100, message: '皮肤 id 解析失败', detail: error });
    return { ok: false, existed: false, path: skinPath, error };
  }
  const toolsState = getToolsEnvStatus();
  if (!toolsState.ready) {
    const error = `工具环境不完整（缺 ${toolsState.missing.join(', ')}），请重新安装本程序`;
    showBuildWindow('构建皮肤');
    updateBuildWindow({ state: 'error', percent: 100, message: '工具环境未初始化', detail: error });
    return { ok: false, existed: false, path: skinPath, error };
  }

  showBuildWindow(`构建皮肤 ${heroId}_${skinId}`);
  let lastError = '';
  setBuildLogSink((line) => updateBuildWindow({ detail: line }));
  try {
    await loadSkinDataByFile(
      idName,
      wadPath,
      null,
      skinIndex,
      undefined,
      (percent, message) => updateBuildWindow({ percent, message, state: 'running' })
    );
  } catch (error) {
    lastError = (error as Error)?.message ?? `${error}`;
  } finally {
    setBuildLogSink(null);
  }

  const ok = existsSync(skinPath);
  updateBuildWindow({
    percent: 100,
    state: ok ? 'success' : 'error',
    message: ok ? '构建成功' : '构建失败',
    detail: ok ? skinPath : lastError || '没有生成皮肤文件',
  });
  if (ok) {
    closeBuildWindow(2500);
  }
  return { ok, existed: false, path: skinPath, error: ok ? undefined : lastError || '没有生成皮肤文件' };
};
export const readConfig = () => readJsonConfig(configPath);
export const setConfig = (key: string, value: string) => {
  patchJsonConfig(configPath, { [key]: value });
};
export const readConfigValue = (key: string) => {
  const config = readConfig();
  return config[key];
};
export const readConfigOrDefault = (key: string, defaultValue: string) => {
  const value = readConfigValue(key);
  if (value) {
    return value;
  }
  setConfig(key, defaultValue);
  return defaultValue;
};

export const getSkinPath = () => {
  return readConfigOrDefault(SKIN_PATH, defaultSkinPath);
};
export const getScreenshotPath = () => {
  return readConfigOrDefault(SCREENSHOT_PATH, defaultScreenshotPath);
};
export const setScreenshotPath = (path_: string) => {
  setConfig(SCREENSHOT_PATH, path_);
};
export const getSkinDefaultSuffix = () => {
  const suffix = readConfigOrDefault(SKIN_DEFAULT_SUFFIX_CONFIG_KEY, defaultSkinSuffix);
  return suffix?.trim() || defaultSkinSuffix;
};
export const getGamePath = () => {
  return readConfigOrDefault(GAME_PATH, defaultGamePath);
};
export const getOverlayPath = () => {
  return readConfigOrDefault(OVERLAY_PATH, defaultOverlayPath);
};
export const getOverlayConfigPath = () => {
  const r = readConfigOrDefault(OVERLAY_CONFIG_PATH, defaultOverlayConfigPath);
  if (!existsSync(r)) {
    ensureFileSync(r);
    writeFileSync(r, JSON.stringify([], null, 2));
  }
  return r;
};
export const setHeroChoseSkin = (heroId: string, skinId: string) => {
  const data = readConfigOrDefault(HERO_SKIN, '{}');
  const d = JSON.parse(data);
  d[heroId] = skinId;
  setConfig(HERO_SKIN, JSON.stringify(d, null, 2));
};
export const getHeroChoseSkin = (heroId: string) => {
  const data = readConfigOrDefault(HERO_SKIN, '{}');
  const d = JSON.parse(data);
  return d[heroId] || '';
};
export const setSkinImage = (skinId: string, skinImage: string) => {
  const data = readConfigOrDefault(SKIN_IMAGE_KEY, '{}');
  const d = JSON.parse(data);
  if (skinImage) {
    d[skinId] = skinImage;
  } else {
    delete d[skinId];
  }
  setConfig(SKIN_IMAGE_KEY, JSON.stringify(d, null, 2));
};
export const clearSkinImage = async (skinId?: string) => {
  if (skinId) {
    setSkinImage(skinId, null);
    return;
  }
  setConfig(SKIN_IMAGE_KEY, '{}');
};
export const getSkinImage = (skinId: string) => {
  const data = readConfigOrDefault(SKIN_IMAGE_KEY, '{}');
  const d = JSON.parse(data);
  return d[skinId] || '';
};
/**
 * 实际生效的工具路径。
 *
 * 工具现在放在 `resources\tools`（安装包自带），所以配置里那串旧的
 * `%LOCALAPPDATA%\lol-skin-ll\tools\mod-tools.exe` 不再权威：
 * 只有「用户自己指定、文件还在」的路径才照用，其它情况都走随包那份。
 */
export const getModToolsPath = () => {
  const raw = readConfigValue(MOD_TOOLS_PATH);
  const configured = `${raw ?? ''}`.trim().replace(/^"|"$/g, '');
  if (configured && existsSync(configured) && !isManagedToolsPath(configured)) {
    return configured;
  }
  return Path.join(resolveToolsDir(), 'mod-tools.exe');
};
export const getInstalledPath = () => {
  return readConfigOrDefault(INSTALLED_PATH, defaultInstalledPath);
};
export const findFile = (dir, targetFile) => {
  if (!fs.existsSync(dir)) {
    return null;
  }
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = Path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 递归搜索子目录
      const result = findFile(fullPath, targetFile);
      if (result) {
        return result;
      }
    } else if (file === targetFile) {
      return fullPath;
    }
  }
  return null;
};
const buildSkinPath = (heroId: string, skinId: string) => {
  const curSkinId = resolveSkinIndex(heroId, skinId);
  const skinBasePath = getSkinDefaultSuffix();
  const skinPath = Path.join(
    getSkinPath(),
    skinBasePath,
    `${heroId}`,
    `${heroId}_${curSkinId}.zip`
  );
  if (fs.existsSync(skinPath)) {
    return skinPath;
  }

  const foundPath = findFile(
    Path.join(getSkinPath(), skinBasePath, heroId),
    `${heroId}_${curSkinId}.zip`
  );
  if (foundPath) {
    return foundPath;
  }

  return Path.join(
    getSkinPath(),
    getSkinDefaultSuffix(),
    `${heroId}`,
    `${heroId}_${curSkinId}.zip`
  );
};
export const checkHasSkins = (heroId: string, skinId: string) => {
  const skinPath = buildSkinPath(`${heroId}`, `${skinId}`);
  return existsSync(skinPath);
};
/** 已启用皮肤的账本：overlays/<heroId>_<skinId> 目录，「皮肤使用中」页面按它列皮肤 */
const markAppliedSkin = (heroId: string, skinId: string) => {
  fs.mkdirSync(Path.join(getOverlayPath(), `${heroId}_${skinId}`), { recursive: true });
};

const listAppliedSkins = () => {
  const overlayPath = getOverlayPath();
  if (!fs.existsSync(overlayPath)) {
    return [];
  }
  return fs
    .readdirSync(overlayPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'all')
    .map((dirent) => dirent.name)
    .map((name) => name.split('_'))
    .filter((parts) => parts.length >= 2)
    .map(([heroId, skinId]) => ({ heroId, skinId }));
};

/**
 * 注入皮肤 —— 按 Rose 1.5 的方式：
 *   皮肤压缩包原样装进 LTK Manager 的模组库 → 只启用它 → 让 LTK Manager 启动
 *   自己的 patcher。不再生成 overlay，也不再用 mod-tools.exe import / mkoverlay
 *   或用户自备的 ltk_patcher_host.exe。
 *
 * *record* 为 true 时把皮肤记进「皮肤使用中」列表。
 */
const injectSkin = async (
  heroId: string,
  skinId: string,
  skinImage: string,
  record: boolean
): Promise<boolean> => {
  const skinPath = buildSkinPath(heroId, skinId);
  if (!existsSync(skinPath)) {
    showToast(`${skinPath} not exists`);
    return false;
  }
  // 生成时做过一次 LTK 名字检查：不通过就别注入 —— patcher 一进游戏就会把整个
  // overlay 关掉（`Integrity scan rejected ... c0000229`），用户只看到「没挂载成功」
  const blocked = blockedSkinCheck(skinPath);
  if (blocked) {
    const detail = describeSkinCheck(blocked);
    LogMsgUtil.sendLogMsg(`[检查] ${skinPath} 没过 LTK 名字检查：${detail}`);
    MessageUtil.error(
      `皮肤 ${heroId}_${skinId} 会被 LTK 判 skinhack（${detail}），已停止加载。` +
        `请换一个皮肤，或重新生成这个皮肤`
    );
    showToast(`该皮肤会被判 skinhack，已停止加载`);
    return false;
  }
  setHeroChoseSkin(heroId, skinId);
  setSkinImage(skinId, skinImage);
  const applied = await ltfInjector.applySkins([{ archive: skinPath, heroId, skinId }]);
  if (!applied.ok) {
    return false;
  }
  if (record) {
    markAppliedSkin(heroId, skinId);
    fs.writeFileSync(getOverlayConfigPath(), JSON.stringify([skinId]), { encoding: 'utf-8' });
  }
  showToast(`已注入 --${heroId}_${skinId}--`);
  return true;
};

/** 使用皮肤：注入并记录到「皮肤使用中」 */
export const loadSkin = async (heroId: string, skinId: string, skinImage: string) => {
  return injectSkin(heroId, skinId, skinImage, true);
};

/** 只注入，不记录（原来「构建 overlay」的位置，现在没有中间 overlay 了） */
export const mkOverlay = async (heroId: string, skinId: string, skinImage: string) => {
  return injectSkin(heroId, skinId, skinImage, false);
};

export const loadSkins = async () => {
  const overlayPathConfig = getOverlayConfigPath();
  const applied = listAppliedSkins();
  if (applied.length === 0) {
    MessageUtil.error('没有皮肤');
    showToast('没有皮肤');
    return;
  }

  const skins = [];
  let missing = 0;
  let blocked = 0;
  for (const { heroId, skinId } of applied) {
    const archive = buildSkinPath(heroId, skinId);
    if (!existsSync(archive)) {
      missing++;
      continue;
    }
    const check = blockedSkinCheck(archive);
    if (check) {
      blocked++;
      continue;
    }
    skins.push({ archive, heroId, skinId });
  }
  if (missing > 0) {
    MessageUtil.warning(`有 ${missing} 个皮肤文件不存在，已跳过`);
  }
  if (blocked > 0) {
    MessageUtil.warning(`有 ${blocked} 个皮肤没过 LTK 检查（会被判 skinhack），已跳过`);
  }
  if (skins.length === 0) {
    MessageUtil.error('没有可注入的皮肤文件');
    return;
  }

  // 全部装进 LTK Manager 的库并启用，一次 patcher 覆盖所有英雄
  const result = await ltfInjector.applySkins(skins);
  if (!result.ok) {
    return;
  }
  fs.writeFileSync(overlayPathConfig, JSON.stringify(skins.map((item) => item.skinId)), {
    encoding: 'utf-8',
    flag: 'w',
  });
  showToast(`已注入 ${skins.length} 个皮肤`);
};
export const getAllLoadSkins = () => {
  const overlayPath = getOverlayPath();
  const folders = fs
    .readdirSync(overlayPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'all')
    .map((dirent) => dirent.name);

  // 提取 skinId
  return folders.map((name) => name.split('_'));
};
export const checkCanAutoConfirm = (opt: ShowSliderConfirmType) => {
  return new Promise((resolve) => {
    showSliderConfirm(
      opt,
      () => {
        resolve(true);
      },
      () => {
        resolve(false);
      }
    );
  });
};
export const openPath = (path_: string) => {
  const normalized = Path.normalize(path_);
  try {
    const stat = fs.statSync(normalized);
    if (stat.isFile()) {
      // 如果是文件，打开父级目录
      shell.openPath(Path.dirname(normalized));
    } else {
      // 如果是目录，直接打开
      shell.openPath(normalized);
    }
  } catch (err) {
    console.error('路径不存在或无法访问:', err);
  }
};
export const emptyPah = async (path_: string, silent = false) => {
  const normalized = Path.normalize(path_);
  try {
    if (!fs.existsSync(normalized)) {
      return;
    }
    const stat = fs.statSync(normalized);
    if (!stat.isFile()) {
      // 如果是目录，直接打开
      await modToolsWrapper.ensureCleanDirectoryWithRetry(normalized);
    }
  } catch (err) {
    MessageUtil.error(`清空文件夹：${err.message}`);
    return;
  }
  if (!silent) {
    MessageUtil.success(`清空文件夹:${path_}`);
  }
};
export const removePath = async (path_: string, silent = false) => {
  const normalized = Path.normalize(path_);
  try {
    if (!fs.existsSync(normalized)) {
      return;
    }
    const stat = fs.statSync(normalized);
    if (stat.isFile()) {
      // 如果是文件，打开父级目录
      fs.rmdirSync(Path.dirname(normalized));
    } else {
      // 如果是目录，直接打开
      await modToolsWrapper.ensureCleanDirectoryWithRetry(normalized);
      fs.rmdirSync(normalized);
    }
  } catch (err) {
    console.error('路径不存在或无法访问:', err);
    MessageUtil.error(`删除失败${err.message}`);
    return;
  }
  if (!silent) {
    MessageUtil.success(`删除成功:${path_}`);
  }
};
export const openUrl = (url: string) => {
  shell.openExternal(url);
};

export const confirmChoseSkin = async (msg: string, imageSrc: string) => {
  return checkCanAutoConfirm({
    title: '提示',
    msg,
    src: imageSrc,
    showBtn: true,
    height: 250,
    delay: 3000,
  });
};
export const showToast = async (msg: string) => {
  showSliderConfirm({
    title: '提示',
    msg,
    height: 80,
    delay: 3000,
  });
};
export const selectPathOrFile = async (
  properties: 'openFile' | 'openDirectory' | 'all' = 'all',
  defaultPath: string
) => {
  const cp = properties === 'all' ? ['openFile', 'openDirectory'] : [properties];
  const result = await dialog.showOpenDialog({
    properties: cp as any, // 允许选择文件或文件夹
    defaultPath,
  });

  if (result.canceled) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  return selectedPath;
};

/**
 * 导入 LeagueSkins 的整包（`skins/<英雄>/<皮肤>/<皮肤>.fantome`）。
 *
 * 真正的解压在 league-skins-import.ts 里，按需流式读取，整包多大都不会
 * 撑爆内存（adm-zip 会 readFileSync 整个包，超过 2 GiB 直接抛
 * ERR_FS_FILE_TOO_LARGE）。
 */
export const importLeagueSkinsPackage = async () => {
  LogMsgUtil.sendLogMsg('[LeagueSkins导入] 开始选择压缩包');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    defaultPath: getSkinPath(),
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  });

  if (result.canceled || !result.filePaths[0]) {
    LogMsgUtil.sendLogMsg('[LeagueSkins导入] 已取消');
    return { canceled: true, count: 0, outDir: '' };
  }

  const imported = await importLeagueSkinsFromZip({
    zipPath: result.filePaths[0],
    skinRoot: getSkinPath(),
    suffix: getSkinDefaultSuffix(),
    log: (message) => LogMsgUtil.sendLogMsg(message),
  });

  if (imported.failed > 0 && imported.count === 0) {
    MessageUtil.error(`导入失败：${imported.failed} 个皮肤都没能写入，详见日志`);
  } else if (imported.error && imported.count === 0) {
    MessageUtil.error(imported.error);
  } else if (imported.count === 0) {
    MessageUtil.error(
      imported.skipped > 0
        ? `无需导入：${imported.skipped} 个皮肤的内容已经和压缩包里一致`
        : '未找到可导入的 LeagueSkins 皮肤文件'
    );
  } else {
    MessageUtil.success(
      `导入 LeagueSkins 皮肤成功：写入 ${imported.count} 个${
        imported.replaced ? `（其中覆盖 ${imported.replaced} 个）` : ''
      }${imported.skipped ? `，内容一致跳过 ${imported.skipped} 个` : ''}${
        imported.failed ? `，失败 ${imported.failed} 个` : ''
      }`
    );
  }

  return imported;
};

/** 记住本次进程内上次选的 LeagueSkins 文件夹，下次打开对话框直接定位过去 */
let lastLeagueSkinsFolder = '';

/**
 * 从本地文件夹导入（不需要先压成 zip）。
 *
 * 选择 `...\LeagueSkins\skins` 或它上一级的仓库目录，目录结构为
 * `skins/<英雄>/<皮肤>/<皮肤>.fantome`；落盘结果与整包导入一致。
 */
export const importLeagueSkinsFolder = async () => {
  LogMsgUtil.sendLogMsg('[LeagueSkins导入] 开始选择文件夹');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: lastLeagueSkinsFolder || getSkinPath(),
  });

  if (result.canceled || !result.filePaths[0]) {
    LogMsgUtil.sendLogMsg('[LeagueSkins导入] 已取消');
    return { canceled: true, count: 0, outDir: '' };
  }

  lastLeagueSkinsFolder = result.filePaths[0];
  const imported = await importLeagueSkinsFromFolder({
    folderPath: lastLeagueSkinsFolder,
    skinRoot: getSkinPath(),
    suffix: getSkinDefaultSuffix(),
    log: (message) => LogMsgUtil.sendLogMsg(message),
  });

  if (imported.error && imported.count === 0) {
    MessageUtil.error(imported.error);
  } else if (imported.failed > 0 && imported.count === 0) {
    MessageUtil.error(`导入失败：${imported.failed} 个皮肤都没能写入，详见日志`);
  } else if (imported.count === 0) {
    MessageUtil.error(
      imported.skipped > 0
        ? `无需导入：${imported.skipped} 个皮肤的内容已经和源文件夹里一致`
        : '未找到可导入的 LeagueSkins 皮肤文件'
    );
  } else {
    MessageUtil.success(
      `从文件夹导入皮肤成功：写入 ${imported.count} 个${
        imported.replaced ? `（其中覆盖 ${imported.replaced} 个）` : ''
      }${imported.skipped ? `，内容一致跳过 ${imported.skipped} 个` : ''}${
        imported.failed ? `，失败 ${imported.failed} 个` : ''
      }`
    );
  }

  return imported;
};

export const shoutDownModTools = async () => {
  // 停止注入：停 patcher、撤掉本次导入、把用户的模组开回去
  await ltfInjector.stop();
  MessageUtil.success('已停止注入');
};
export const unpackWadFileTo = async (fullWadPath) => {
  return unpackWadFile(fullWadPath);
};
export const setIsUseCommand = (isUseCommand: boolean) => {
  setUseCommand(isUseCommand);
};
