/**
 * 战绩展示格式化工具
 */

/** 秒 → "X分YY秒" */
export const formatDuration = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
};

/** 毫秒时间戳 → "YYYY-MM-DD HH:mm" */
export const formatDateTime = (timestamp: number): string => {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
};

/** 数值保留 n 位小数 */
export const toFixed = (value: number, digits = 1): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }
  return value.toFixed(digits);
};

/** 大数字缩写：12345 → 12.3k，1234567 → 1.2m */
export const formatExtremeNumber = (value: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}m`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return `${Math.round(value)}`;
};

