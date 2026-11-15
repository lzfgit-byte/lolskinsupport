/**
 * config.json 的安全读写。
 *
 * 这里有两个真踩过的坑：
 *
 *   1. 文件带 BOM（Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8`、
 *      记事本另存为都会写 BOM），`JSON.parse` 直接抛错；
 *   2. 各模块解析失败时返回 `{}`，然后又把整个对象写回去 —— 于是用户所有设置
 *      （皮肤目录后缀、每个英雄上次选的皮肤、游戏路径…）被一份「只有默认值」的
 *      文件覆盖，表现就是「明明有皮肤却提示请先下载英雄皮肤」「历史选中皮肤不回显」。
 *
 * 所以统一走这里：
 *   - 读：容忍 BOM 和首尾空白；真的解析不了就先备份成 `config.json.broken-<时间>`，
 *     再当空配置继续（绝不原地覆盖坏文件）；
 *   - 写：临时文件 + rename，避免写到一半留下半个文件。
 */

import fs from 'node:fs';
import path from 'node:path';

const BOM = 0xfeff;

/** 去掉 UTF-8 BOM（`\uFEFF`），没有就原样返回 */
export const stripBom = (text: string): string =>
  text.charCodeAt(0) === BOM ? text.slice(1) : text;

/** 把一个坏掉的配置文件复制一份留底，返回备份路径 */
const backupBroken = (file: string): string | null => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${file}.broken-${stamp}`;
    fs.copyFileSync(file, backup);
    console.warn(`[config] ${path.basename(file)} 解析失败，已备份到 ${backup}`);
    return backup;
  } catch (error) {
    console.warn(`[config] 备份 ${file} 失败:`, error);
    return null;
  }
};

/** 读配置：文件不存在 / 空文件 / 坏 JSON 都返回 {}，坏 JSON 会先备份 */
export const readJsonConfig = (file: string): Record<string, any> => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch {
    return {};
  }
  const body = stripBom(text).trim();
  if (!body) {
    return {};
  }
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
  } catch (error) {
    backupBroken(file);
    console.warn(`[config] ${path.basename(file)} 不是合法 JSON，按空配置处理:`, error);
    return {};
  }
};

/** 写配置：先写 .tmp 再改名，UTF-8 无 BOM */
export const writeJsonConfig = (file: string, data: Record<string, any>): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(temp, file);
};

/** 改一个键：读取 → 改 → 整体写回（保留其它键） */
export const patchJsonConfig = (
  file: string,
  patch: Record<string, unknown>
): Record<string, any> => {
  const config = readJsonConfig(file);
  Object.assign(config, patch);
  writeJsonConfig(file, config);
  return config;
};
