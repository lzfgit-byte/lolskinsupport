/**
 * 皮肤 WAD 的 base-skin 改写（对齐 Rose 1.5.9 的 `injection/baseskin`，提交 2c64012d）。
 *
 * 为什么需要：LTK Manager 的 patcher 在游戏里会检查 skin0.bin 用的骨架/网格。
 * 如果 skin0 指向「同英雄其它皮肤」的 SKN/SKL，就判成 skinhack，整局 overlay 关闭。
 * 生成流程只把 `skin<N>.bin` 改名成 `skin0.bin`、把顶层 key 改成 Skin0，
 * 但 `championSkinName` / `skeleton` / `simpleSkin` 还指向 Skin11，WAD 里也没有
 * 网格文件 —— 所以 LTK 一进游戏就拒。
 *
 * Rose 的做法（本项目照做）：
 *   1. 把皮肤的 SKN/SKL **重建**后放到 base 皮肤路径
 *      `assets/characters/<champ>/skins/base/<champ>.skn|skl`。重建 = 骨架加一根
 *      没人用的 null_bone 关节、网格加一个末顶点的拷贝（见 skin-mesh.ts），
 *      这样文件与游戏自带的 base 网格不同、但模型和动画完全一样；
 *   2. 把 bin 里的 `skeleton` / `simpleSkin` 指到上面这两个文件；
 *   3. `championSkinName` 改成该英雄 base 皮肤的名字（从游戏 skin0.bin 里读出来，不能猜）。
 *
 * 老实现是往 SKN/SKL 末尾补 16 个 0 字节 —— patcher 比较时忽略追加的尾巴，
 * 所以那样做没用（1.5.9 之前我们和 Rose 都踩过这个坑）。这里先把旧填充削掉再重建。
 *
 * 声音部分（LTK 还会看 `TagEventList` / `BankUnits[].Name` / 事件名，见 skin-audio.ts）：
 * 这里把音频身份换回 base 皮肤的（游戏 skin0.bin 里那两段），所以皮肤的专属音效
 * 会退回 base 皮肤的。Rose 是把自己的 bank 换路径塞进包里、并在 bank 里加 base 名字
 * 的事件别名来保住专属音效（`audio.py` 的 merge + `META/rose_sounds.json`），
 * 那步要写 BNK/WPK 和多语言 WAD，还没移植。
 */

import fs from 'node:fs';
import path from 'node:path';
import { readAudioBlocks, replaceAudioBlocks, skinAudioMarkers, type AudioBlocks } from './skin-audio';
import { prepareMeshFile, type MeshRebuildKind } from './skin-mesh';

/** 一个被复制进打包目录的网格文件 */
export interface RebuiltMesh {
  /** 写进打包目录的相对路径（小写形式，跟着目录结构） */
  path: string;
  /** 写回 bin 的引用（ASSETS/... 形式） */
  reference: string;
  /** 游戏 WAD 里的来源路径 */
  source: string;
  /** 新建了什么 */
  added: MeshRebuildKind | 'unchanged';
  bytes: number;
}

export interface RebaseResult {
  /** 复制进 WAD 的文件（相对 outputRoot），兼容旧字段 */
  copied: string[];
  championSkinName: string;
  skeleton: string;
  simpleSkin: string;
  meshes: RebuiltMesh[];
  /** 换成 base 皮肤的音频段（tagEventList / bankUnits） */
  audioReplaced: string[];
  /** 换完之后音频段里还残留的「别的皮肤」名字（正常应该是空） */
  audioLeftover: string[];
}

export interface RebaseSkinPyOptions {
  /** ritobin 转出来的 .py 文件 */
  pyPath: string;
  /** 角色目录名，例如 vayne / jade_vayne */
  character: string;
  /** 该角色 base 皮肤的 championSkinName，例如 VayneBase */
  baseChampionSkinName: string;
  /** 该角色 base 皮肤（游戏 skin0.bin）的音频段，用来把皮肤音频身份换回 base */
  baseAudio?: AudioBlocks;
  /** 游戏 WAD 解压目录（里面有 assets/、data/），可选 */
  extractRoot?: string;
  /** 已经取出来的资源（key 是小写相对路径），从游戏 WAD 按需抽取时用 */
  assets?: Map<string, Buffer>;
  /** 这个皮肤的打包目录（wad-make 的输入） */
  outputRoot: string;
  log?: (message: string) => void;
}

/** vayne -> Vayne，jade_vayne -> Jade_Vayne */
export const capitalizeCharacter = (character: string): string =>
  character
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join('_');

/** 按大小写不敏感的方式在解压目录里找文件（WAD 里的路径大小写和磁盘上常不一致） */
export const findCaseInsensitive = (root: string, relativePath: string): string | null => {
  const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  let current = root;
  for (const segment of segments) {
    let entries: string[];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return null;
    }
    const found = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
    if (!found) {
      return null;
    }
    current = path.join(current, found);
  }
  return fs.existsSync(current) ? current : null;
};

const readStringField = (text: string, field: string): string | null => {
  const matched = new RegExp(`${field}:\\s*string\\s*=\\s*"([^"]*)"`).exec(text);
  return matched ? matched[1] : null;
};

/** 读出一份皮肤 bin 里引用的网格/骨架路径（没有就返回空） */
export const readSkinMeshRefs = (pyPath: string): string[] => {
  const text = fs.readFileSync(pyPath, 'utf-8');
  return [readStringField(text, 'skeleton'), readStringField(text, 'simpleSkin')].filter(
    (value): value is string => !!value
  );
};

const replaceStringField = (text: string, field: string, value: string): string =>
  text.replace(new RegExp(`(${field}:\\s*string\\s*=\\s*")[^"]*(")`), `$1${value}$2`);

const samePath = (left: string, right: string): boolean =>
  left.replace(/\\/g, '/').toLowerCase() === right.replace(/\\/g, '/').toLowerCase();

/**
 * 改写一份 ritobin 文本：重建 SKN/SKL 到 base 路径并改写身份字段。
 *
 * 返回 null 表示这份 bin 里没有 skeleton/simpleSkin（不是皮肤数据），调用方保持原样。
 */
export const rebaseSkinPy = (options: RebaseSkinPyOptions): RebaseResult | null => {
  const log = options.log ?? (() => {});
  const text = fs.readFileSync(options.pyPath, 'utf-8');
  const skeleton = readStringField(text, 'skeleton');
  const simpleSkin = readStringField(text, 'simpleSkin');
  if (!skeleton || !simpleSkin) {
    log(`[base-skin] ${path.basename(options.pyPath)} 没有 skeleton/simpleSkin，跳过`);
    return null;
  }

  const character = options.character;
  const hero = capitalizeCharacter(character);
  const meshes: RebuiltMesh[] = [];

  const place = (source: string, kind: 'skn' | 'skl'): string | null => {
    const targetRelative = path.posix.join(
      'assets',
      'characters',
      character,
      'skins',
      'base',
      `${character}.${kind}`
    );
    const reference = `ASSETS/Characters/${hero}/Skins/Base/${hero}.${kind}`;
    // 本来就指向 base 皮肤：游戏自带的文件就够，不用复制（Rose 也是这样）
    if (samePath(source, reference)) {
      log(`[base-skin] ${character}: ${source} 已经是 base 路径，沿用游戏自带文件`);
      return reference;
    }
    const key = source.replace(/\\/g, '/').toLowerCase();
    let data: Buffer | null = options.assets?.get(key) ?? null;
    if (!data && options.extractRoot) {
      const found = findCaseInsensitive(options.extractRoot, source);
      data = found ? fs.readFileSync(found) : null;
    }
    if (!data) {
      log(`[base-skin] 游戏 WAD 里找不到 ${source}，保持原引用`);
      return null;
    }
    let prepared: { data: Buffer; added: MeshRebuildKind | 'unchanged' };
    try {
      prepared = prepareMeshFile(data);
    } catch (error) {
      // 不是认识的 SKN/SKL：原样拷过去（base 身份对上了，但 LTK 的网格检查可能还过不去）
      log(
        `[base-skin] ${source} 不是能重建的网格（${(error as Error).message}），原样复制`
      );
      prepared = { data, added: 'unchanged' };
    }
    const target = path.join(options.outputRoot, targetRelative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, prepared.data);
    meshes.push({
      path: targetRelative,
      reference,
      source,
      added: prepared.added,
      bytes: prepared.data.length,
    });
    return reference;
  };

  const skeletonRef = place(skeleton, 'skl') ?? skeleton;
  const simpleSkinRef = place(simpleSkin, 'skn') ?? simpleSkin;

  let next = replaceStringField(text, 'championSkinName', options.baseChampionSkinName);
  next = replaceStringField(next, 'skeleton', skeletonRef);
  next = replaceStringField(next, 'simpleSkin', simpleSkinRef);
  // base 皮肤没有自己的 championSkinId（Rose 的 rebase 也会去掉）
  next = next
    .split('\n')
    .filter((line) => !/^\s*championSkinId:\s*i32\s*=/.test(line))
    .join('\n');
  // 音频身份：TagEventList / BankUnits 换回 base 皮肤的，否则 patcher 会因为
  // `<英雄>_Skin<n>_SFX` / `Play_sfx_<英雄>Skin<n>_...` 这些名字再判一次 skinhack
  let audioReplaced: string[] = [];
  if (options.baseAudio) {
    const audio = replaceAudioBlocks(next, options.baseAudio);
    next = audio.text;
    audioReplaced = audio.replaced;
  }
  const audioText = [
    readAudioBlocks(next)?.tagEventList ?? '',
    readAudioBlocks(next)?.bankUnits ?? '',
  ].join('\n');
  const audioLeftover = skinAudioMarkers(audioText, character);
  fs.writeFileSync(options.pyPath, next, 'utf-8');

  log(
    `[base-skin] ${character}: championSkinName=${options.baseChampionSkinName}，` +
      `skeleton=${skeletonRef}，simpleSkin=${simpleSkinRef}`
  );
  if (audioReplaced.length > 0) {
    log(`[base-skin] ${character}: 音频身份换成 base 皮肤的（${audioReplaced.join(', ')}）`);
  }
  if (audioLeftover.length > 0) {
    log(
      `[base-skin] ${character}: 音频段里还有别的皮肤的名字（${audioLeftover
        .slice(0, 5)
        .join(', ')}），LTK 可能还会判 skinhack`
    );
  }
  for (const item of meshes) {
    log(
      `[base-skin] ${character}: ${item.source} -> ${item.path} ` +
        `(${item.added}，${item.bytes} 字节)`
    );
  }
  return {
    copied: meshes.map((item) => item.path),
    championSkinName: options.baseChampionSkinName,
    skeleton: skeletonRef,
    simpleSkin: simpleSkinRef,
    meshes,
    audioReplaced,
    audioLeftover,
  };
};
