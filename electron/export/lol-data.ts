import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePublic } from '../utils/KitUtil';

/**
 * 随包发布的英雄/皮肤数据目录
 * 源码位于 public/lol-data，打包后位于 dist/lol-data（process.env.PUBLIC 指向 dist）
 */
const LOL_DATA_DIR = 'lol-data';

/** 依次尝试的本地数据根目录（打包后/开发时） */
const getLolDataRoots = (): string[] => {
  const roots: string[] = [];
  try {
    if (process.env.PUBLIC) {
      roots.push(resolvePublic(LOL_DATA_DIR));
    }
  } catch {
    // PUBLIC 未设置时忽略
  }
  roots.push(join(process.cwd(), 'public', LOL_DATA_DIR));
  return roots;
};

/** 解析本地数据文件的绝对路径，路径非法或不存在时返回空字符串 */
const resolveLolDataPath = (relativePath: string): string => {
  const safe = `${relativePath ?? ''}`.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!safe || safe.includes('..')) {
    return '';
  }
  return (
    getLolDataRoots()
      .map((root) => join(root, safe))
      .find((fullPath) => existsSync(fullPath)) || ''
  );
};

/**
 * 读取本地英雄/皮肤数据文件
 * @param relativePath 相对 lol-data 目录的路径，例如 hero_list.json、heroes/1.json
 * @returns 文件文本，不存在或读取失败返回空字符串
 */
export const readLolDataFile = (relativePath: string): string => {
  try {
    const fullPath = resolveLolDataPath(relativePath);
    if (!fullPath) {
      return '';
    }
    return readFileSync(fullPath, { encoding: 'utf-8' });
  } catch {
    return '';
  }
};

/**
 * 判断本地英雄/皮肤数据文件是否存在
 * @param relativePath 相对 lol-data 目录的路径
 */
export const hasLolDataFile = (relativePath: string): boolean => {
  try {
    return !!resolveLolDataPath(relativePath);
  } catch {
    return false;
  }
};

/**
 * 读取本地数据包信息（lol-data/meta.json）
 * @returns 文件文本，不存在返回空字符串
 */
export const getLolDataMeta = (): string => {
  return readLolDataFile('meta.json');
};
