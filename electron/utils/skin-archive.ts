/**
 * 皮肤压缩包的删除工具。
 *
 * 「构建并注入」要强制重建，就得先删掉上一次的包；路径是 `heroId` / `skinId`
 * 拼出来的，删之前必须确认它真在皮肤目录里 —— 拼错一个变量就可能是别处的文件。
 * 逻辑单拎出来是为了能跑单元测试（`npm run archive:test`）。
 */
import fs from 'node:fs';
import Path from 'node:path';

/**
 * `file` 是不是 `dir` 里面的（真子路径）。
 *
 * `..` 跳出去的、跨盘的（Windows 上 `Path.relative` 会直接给绝对路径）都不算。
 */
export const isUnderDir = (file: string, dir: string): boolean => {
  const rel = Path.relative(Path.resolve(dir), Path.resolve(file));
  return !!rel && !rel.startsWith('..') && !Path.isAbsolute(rel);
};

/**
 * 删掉 `files` 里位于 `dir` 下面的文件，返回真正删掉的个数。
 *
 * 不在 `dir` 下面的直接跳过（不报错也不删），不存在的也算没删。
 */
export const removeFilesUnder = (dir: string, files: string[]): number => {
  let removed = 0;
  for (const file of files) {
    if (!isUnderDir(file, dir)) {
      continue;
    }
    if (!fs.existsSync(file)) {
      continue;
    }
    fs.rmSync(file, { force: true });
    removed++;
  }
  return removed;
};
