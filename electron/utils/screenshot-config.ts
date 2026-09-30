/**
 * 多杀截图的时机配置（延迟 / 连拍时长 / 调试开关）
 *
 * 这些配置直接读写 config.json，避免和 export/index.ts 相互引用产生循环依赖。
 */
import { ensureFileSync, existsSync, readFileSync, writeFileSync } from 'fs-extra';
import {
  MULTIKILL_CAPTURE_DEBUG,
  MULTIKILL_CAPTURE_DELAY,
  MULTIKILL_CAPTURE_WINDOW,
  configPath,
  defaultMultiKillCaptureDebug,
  defaultMultiKillCaptureDelay,
  defaultMultiKillCaptureWindow,
} from '../const';

function readConfigObject(): Record<string, any> {
  try {
    if (!existsSync(configPath)) {
      ensureFileSync(configPath);
      writeFileSync(configPath, JSON.stringify({}));
    }
    return JSON.parse(readFileSync(configPath, { encoding: 'utf-8' })) ?? {};
  } catch {
    return {};
  }
}

function writeConfigValue(key: string, value: any): void {
  try {
    const config = readConfigObject();
    config[key] = value;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error(`[ScreenshotConfig] Failed to write ${key}:`, error);
  }
}

/** 读取数值型配置，非法值回退到默认值，并做区间限制 */
function readNumberConfig(key: string, defaultValue: number, min: number, max: number): number {
  const raw = readConfigObject()[key];

  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.min(Math.max(value, min), max);
}

function readBooleanConfig(key: string, defaultValue: boolean): boolean {
  const raw = readConfigObject()[key];

  if (typeof raw === 'boolean') {
    return raw;
  }

  if (typeof raw === 'string') {
    return raw.toLowerCase() === 'true';
  }

  return defaultValue;
}

/** 多杀事件后、开始连拍前的等待时间（毫秒） */
export const getMultiKillCaptureDelay = (): number => {
  return readNumberConfig(MULTIKILL_CAPTURE_DELAY, defaultMultiKillCaptureDelay, 0, 8000);
};

export const setMultiKillCaptureDelay = (value: number): number => {
  const next = Math.min(Math.max(Number(value) || 0, 0), 8000);
  writeConfigValue(MULTIKILL_CAPTURE_DELAY, `${next}`);
  return next;
};

/** 连拍总时长（毫秒），最终保存连拍过程中的最后一帧 */
export const getMultiKillCaptureWindow = (): number => {
  return readNumberConfig(MULTIKILL_CAPTURE_WINDOW, defaultMultiKillCaptureWindow, 0, 5000);
};

export const setMultiKillCaptureWindow = (value: number): number => {
  const next = Math.min(Math.max(Number(value) || 0, 0), 5000);
  writeConfigValue(MULTIKILL_CAPTURE_WINDOW, `${next}`);
  return next;
};

/** 调试开关：打开后会把连拍过程中的每一帧都保存下来，方便校准延迟 */
export const getMultiKillCaptureDebug = (): boolean => {
  return readBooleanConfig(MULTIKILL_CAPTURE_DEBUG, defaultMultiKillCaptureDebug);
};

export const setMultiKillCaptureDebug = (value: boolean): boolean => {
  const next = value === true || `${value}`.toLowerCase() === 'true';
  writeConfigValue(MULTIKILL_CAPTURE_DEBUG, next);
  return next;
};
