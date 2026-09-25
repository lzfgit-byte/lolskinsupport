/**
 * overlay WAD 工具。
 *
 * `mod-tools.exe mkoverlay` 写出来的 overlay 是「镜像游戏目录结构」的 WAD 树，
 * 例如 `<overlay>/DATA/FINAL/Champions/Vayne.wad.client`。
 * ltk_patcher_dll 就是按 `<prefix>/**\/*.wad.client` 递归找它们的。
 *
 * 这里负责三件事：
 *   1. 找出 overlay 里真正的 wad（和 DLL 的 glob 保持一致）
 *   2. 识别 cslol-manager 加密分支写出的 CLST overlay —— ltk_patcher 用不了
 *   3. 把游戏原版 WAD 的签名 + 校验和拷回 overlay WAD
 */

import fs from 'node:fs';
import path from 'node:path';

/** WAD v3 头部：magic + version (4) + RSA 签名 (256) + 校验和 (8) */
export const WAD_HEADER_SIZE = 268;

/**
 * cslol-manager 分支的 mod-tools 会走 `encrypted_write_to_directory`，
 * 把 overlay 用 ChaCha20 加密，magic 写成 `CLST`、校验和写 0。
 * 这种 overlay 只有 cslol-dll 能解，ltk_patcher_dll 不认。
 */
const ENCRYPTED_WAD_MAGIC = 'CLST';

const WAD_SUFFIX = '.wad.client';

/** 递归找出目录下的所有 `*.wad.client`（对应 DLL 的 `/**\/*.wad.client`） */
export const findOverlayWads = (dir: string): string[] => {
  const found: string[] = [];
  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(WAD_SUFFIX)) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
};

/** 读文件开头的几个字节，失败返回 null */
const readMagic = (file: string, length: number): Buffer | null => {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, 0);
    return read === length ? buffer : null;
  } catch {
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // 忽略
    }
  }
};

/** 是否是加密 overlay（cslol-manager 分支产物），ltk_patcher 无法使用 */
export const isEncryptedOverlay = (wadPath: string): boolean => {
  const magic = readMagic(wadPath, ENCRYPTED_WAD_MAGIC.length);
  return magic !== null && magic.toString('latin1') === ENCRYPTED_WAD_MAGIC;
};

export interface WadHeaderRestoreResult {
  /** 找到的 wad 数 */
  total: number;
  /** 成功补回原版头部 */
  restored: number;
  /** 找不到原版文件 / 魔数不符，跳过 */
  skipped: number;
  /** 加密的 CLST overlay */
  encrypted: number;
}

/**
 * 把游戏原版 WAD 的签名 + 校验和拷回 overlay WAD。
 *
 * mkoverlay 写出的是自己的签名和全 0 校验和；自 16.19 起游戏会把这种 wad
 * 判成损坏（"WadFile mount failed"）并给安装打上待修复标记。
 * LTK Manager 在 rebase 时会保留原版头部，这里做同样的事。
 *
 * 是幂等的，重复调用没有副作用。
 */
export const restoreWadHeaders = (
  overlayDir: string,
  gameDir: string
): WadHeaderRestoreResult => {
  const result: WadHeaderRestoreResult = { total: 0, restored: 0, skipped: 0, encrypted: 0 };

  for (const wad of findOverlayWads(overlayDir)) {
    result.total += 1;

    if (isEncryptedOverlay(wad)) {
      result.encrypted += 1;
      continue;
    }

    // overlay 目录镜像游戏目录，相对路径就是游戏里的位置
    const original = path.join(gameDir, path.relative(overlayDir, wad));
    const header = readMagic(original, WAD_HEADER_SIZE);
    if (!header || header.subarray(0, 2).toString('latin1') !== 'RW') {
      result.skipped += 1;
      continue;
    }

    let fd: number | null = null;
    try {
      fd = fs.openSync(wad, 'r+');
      const magic = Buffer.alloc(4);
      if (fs.readSync(fd, magic, 0, 4, 0) !== 4 || !magic.equals(header.subarray(0, 4))) {
        // 版本对不上就不动，免得把 wad 写坏
        result.skipped += 1;
        continue;
      }
      // 保留 overlay 自己的 magic + version，只覆盖签名和校验和
      fs.writeSync(fd, header, 4, WAD_HEADER_SIZE - 4, 4);
      result.restored += 1;
    } catch {
      result.skipped += 1;
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // 忽略
        }
      }
    }
  }

  return result;
};
