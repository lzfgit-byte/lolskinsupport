/**
 * 游戏语言自动修复（迁移自 LOLauncher）
 *
 * 功能：监听 Riot 的游戏语言配置文件（league_of_legends.live.product_settings.yaml 等），
 * 当游戏更新恢复默认语言时，自动将语言改回用户选择的语言。
 *
 * 原理：
 * 1. 通过 chokidar 监听配置文件的变更（等价于 Python 版的 watchdog）
 * 2. 文件被修改后解析 YAML，校验结构
 * 3. 若当前语言与用户选择不一致，备份文件后自动改回用户选择的语言
 *
 * 注意：写入后文件保持可写，这样游戏仍能更新，本模块才能持续检测并修复。
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { type FSWatcher, watch } from 'chokidar';
import yaml from 'js-yaml';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import {
  LOCALE_WATCHER_ENABLED,
  LOCALE_WATCHER_FILE,
  LOCALE_WATCHER_LOCALE,
  configPath,
} from '../const';

/** 支持的游戏版本线（live = 正式服，pbe = 测试服） */
const SUPPORTED_PATCH_LINES = ['live', 'pbe'];
/** 配置文件所在目录格式 */
const METADATA_DIR_FORMAT =
  '{drive}ProgramData\\Riot Games\\Metadata\\league_of_legends.{patch_line}';
const METADATA_FILE_FORMAT = 'league_of_legends.{patch_line}.product_settings.yaml';
const DEFAULT_LOCALE = 'zh_CN';

/** 语言代码映射（与 LOLauncher 保持一致） */
export const LOCALE_CODES: Record<string, string> = {
  zh_CN: '简体中文（国服）',
  zh_MY: '简体中文（马来西亚）',
  zh_TW: '繁体中文',
  en_US: '英语（美国）',
  en_GB: '英语（英国）',
  en_AU: '英语（澳大利亚）',
  en_PH: '英语（菲律宾）',
  en_SG: '英语（新加坡）',
  ja_JP: '日语',
  ko_KR: '韩语',
  cs_CZ: '捷克语',
  de_DE: '德语',
  el_GR: '希腊语',
  es_AR: '西班牙语（阿根廷）',
  es_ES: '西班牙语（西班牙）',
  es_MX: '西班牙语（墨西哥）',
  fr_FR: '法语（法国）',
  hu_HU: '匈牙利语',
  it_IT: '意大利语',
  pl_PL: '波兰语',
  pt_BR: '葡萄牙语（巴西）',
  ro_RO: '罗马尼亚语',
  ru_RU: '俄语',
  th_TH: '泰语',
  tr_TR: '土耳其语',
  vi_VN: '越南语',
};

// ===================== 状态 =====================
let watcher: FSWatcher | null = null;
let selectedLocale = DEFAULT_LOCALE;
let watchedFile = '';
// 防止 chokidar 连续触发导致重复写入
let updateTimer: NodeJS.Timeout | null = null;

// ===================== 配置读写（本地实现，避免循环依赖） =====================
const readConfig = (): Record<string, any> => {
  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, '{}', 'utf8');
      return {};
    }
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('[LocaleWatcher] readConfig error:', e);
    return {};
  }
};
const setConfig = (key: string, value: string) => {
  const config = readConfig();
  config[key] = value;
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
};

// ===================== YAML 辅助函数 =====================
/** 校验设置结构是否有效（存在 settings 与 locale_data 字段） */
const isValidSettings = (settings: any): boolean =>
  settings !== null &&
  typeof settings === 'object' &&
  'settings' in settings &&
  'locale_data' in settings;

const readYaml = (filePath: string): any => {
  try {
    const content = readFileSync(filePath, 'utf8');
    return yaml.load(content);
  } catch (e) {
    console.error(`[LocaleWatcher] 读取 YAML 失败 ${filePath}:`, e);
    return null;
  }
};

const writeYaml = (filePath: string, data: any): boolean => {
  try {
    writeFileSync(filePath, yaml.dump(data), 'utf8');
    return true;
  } catch (e) {
    console.error(`[LocaleWatcher] 写入 YAML 失败 ${filePath}:`, e);
    return false;
  }
};

/** 判断文件是否只读（无写权限） */
const isReadOnly = (filePath: string): boolean => {
  try {
    const stat = statSync(filePath);
    return (stat.mode & 0o200) === 0;
  } catch {
    return true;
  }
};

const backupFile = (filePath: string): void => {
  try {
    copyFileSync(filePath, `${filePath}.bak`);
  } catch (e) {
    console.error(`[LocaleWatcher] 备份失败 ${filePath}:`, e);
  }
};

// ===================== 核心逻辑 =====================
/**
 * 更新配置文件中的语言
 * @returns 更新后的设置内容；失败或无需修改时返回 null
 */
export const updateLocaleSettings = (
  filePath: string,
  locale: string,
  msgCallback?: (msg: string) => void
): any => {
  const msg = msgCallback || ((m: string) => LogMsgUtil.sendLogMsg(`[LocaleWatcher] ${m}`));
  try {
    const settingContent = readYaml(filePath);
    if (!isValidSettings(settingContent)) {
      msg(`无效文件: ${filePath}`);
      return null;
    }
    const currentLocale = settingContent.settings.locale;
    if (currentLocale !== locale) {
      msg('正在备份文件...');
      backupFile(filePath);
    }
    settingContent.settings.locale = locale;
    // 若文件只读，先临时去掉只读属性再写入（写入后保持可写，让游戏可更新）
    const readonly = isReadOnly(filePath);
    if (readonly) {
      try {
        chmodSync(filePath, 0o600);
      } catch (e) {
        msg(`文件只读，无法更新: ${filePath}`);
        return settingContent;
      }
    }
    if (!writeYaml(filePath, settingContent)) {
      msg(`更新设置文件失败: ${filePath}`);
      return settingContent;
    }
    msg('更新设置文件成功!');
    return settingContent;
  } catch (e) {
    msg(`更新设置文件失败: ${filePath}, error: ${e}`);
    return null;
  }
};

/** 获取全部语言代码（key -> 名称） */
export const getLocaleCodes = (): Record<string, string> => ({ ...LOCALE_CODES });

/**
 * 读取配置文件并返回其中的当前语言
 * @returns 文件不存在/结构无效时返回 null
 */
export const readLocaleConfigFile = (
  filePath: string
): { valid: boolean; locale: string | null } | null => {
  if (!filePath || !existsSync(filePath)) {
    return { valid: false, locale: null };
  }
  const content = readYaml(filePath);
  if (!isValidSettings(content)) {
    return { valid: false, locale: null };
  }
  return { valid: true, locale: content.settings.locale ?? null };
};

/** 获取所有 Windows 盘符 */
const getDrives = (): string[] => {
  const drives: string[] = [];
  for (let i = 0; i < 26; i++) {
    const drive = `${String.fromCharCode(65 + i)}:\\`;
    if (existsSync(drive)) {
      drives.push(drive);
    }
  }
  return drives;
};

/**
 * 自动检测所有有效的 Riot 语言配置文件（遍历各盘符的 live / pbe 目录）
 * 等价于 LOLauncher 的 detect_metadata_file()
 */
export const detectLocaleConfigFile = (): string[] => {
  const result: string[] = [];
  for (const drive of getDrives()) {
    for (const patchLine of SUPPORTED_PATCH_LINES) {
      const dir = METADATA_DIR_FORMAT.replace('{drive}', drive).replace('{patch_line}', patchLine);
      const filePath = path.join(dir, METADATA_FILE_FORMAT.replace('{patch_line}', patchLine));
      if (existsSync(filePath) && isValidSettings(readYaml(filePath))) {
        result.push(filePath);
      }
    }
  }
  return result;
};

/** 获取当前监听状态 */
export const getLocaleWatcherState = () => {
  const current = watchedFile ? readLocaleConfigFile(watchedFile) : null;
  return {
    enabled: !!watcher,
    file: watchedFile,
    locale: selectedLocale,
    localeName: LOCALE_CODES[selectedLocale] || selectedLocale,
    currentLocale: current?.valid ? current.locale : null,
    detectedFiles: detectLocaleConfigFile(),
  };
};

// ===================== 监听逻辑 =====================
/** 文件被修改后，若语言不一致则自动修复 */
const onFileChanged = (filePath: string) => {
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  updateTimer = setTimeout(() => {
    const info = readLocaleConfigFile(filePath);
    if (!info || !info.valid) {
      return;
    }
    if (info.locale !== selectedLocale) {
      LogMsgUtil.sendLogMsg(
        `[LocaleWatcher] 正在将语言 ${info.locale} 更新为 ${selectedLocale} ...`
      );
      updateLocaleSettings(filePath, selectedLocale);
    }
  }, 500);
};

const stopWatcher = () => {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  if (watcher) {
    watcher.close().catch(() => {});
    watcher = null;
  }
};

/**
 * 启动语言监听
 * @param opts.filePath 配置文件路径（不传则自动检测）
 * @param opts.locale   目标语言代码（不传则读取配置，默认 zh_CN）
 */
export const startLocaleWatcher = (opts: { filePath?: string; locale?: string } = {}) => {
  const config = readConfig();
  let filePath = opts.filePath || config[LOCALE_WATCHER_FILE] || '';
  const locale = opts.locale || config[LOCALE_WATCHER_LOCALE] || DEFAULT_LOCALE;

  if (!filePath) {
    const detected = detectLocaleConfigFile();
    filePath = detected[0] || '';
    if (!filePath) {
      MessageUtil.error(
        '未找到英雄联盟语言配置文件，请手动指定 league_of_legends.[live|pbe].product_settings.yaml 路径'
      );
      return getLocaleWatcherState();
    }
  }

  if (!existsSync(filePath)) {
    MessageUtil.error(`配置文件不存在: ${filePath}`);
    return getLocaleWatcherState();
  }

  stopWatcher();
  selectedLocale = LOCALE_CODES[locale] ? locale : DEFAULT_LOCALE;
  watchedFile = filePath;

  // 保存配置，供下次启动时自动恢复
  setConfig(LOCALE_WATCHER_FILE, filePath);
  setConfig(LOCALE_WATCHER_LOCALE, selectedLocale);
  setConfig(LOCALE_WATCHER_ENABLED, 'true');

  // 启动前先应用一次目标语言
  updateLocaleSettings(filePath, selectedLocale);

  // 监听文件（文件不存在/被替换时 chokidar 也会通过 add 事件捕获）
  watcher = watch(filePath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });
  watcher.on('change', () => onFileChanged(filePath));
  watcher.on('add', () => onFileChanged(filePath));
  watcher.on('error', (error) => {
    LogMsgUtil.sendLogMsg(`[LocaleWatcher] 监听错误: ${error}`);
  });

  LogMsgUtil.sendLogMsg(
    `[LocaleWatcher] 已开始监听 ${watchedFile}，目标语言: ${
      LOCALE_CODES[selectedLocale] || selectedLocale
    }`
  );
  return getLocaleWatcherState();
};

/** 停止语言监听 */
export const stopLocaleWatcher = () => {
  stopWatcher();
  setConfig(LOCALE_WATCHER_ENABLED, 'false');
  LogMsgUtil.sendLogMsg('[LocaleWatcher] 已停止监听');
  return getLocaleWatcherState();
};

/** 应用启动时调用：若之前启用了语言监听，则自动恢复监听 */
export const initLocaleWatcher = (): boolean => {
  const config = readConfig();
  if (config[LOCALE_WATCHER_ENABLED] === 'true') {
    startLocaleWatcher();
    return true;
  }
  return false;
};
