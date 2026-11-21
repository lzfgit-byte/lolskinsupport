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
 *   2. 把 bin 里的 `skeleton` / `simpleSkin` 指到上面这两个文件（字符串照抄游戏
 *      base skin0.bin 里的写法，大小写不能自己拼）；
 *   3. `championSkinName` 改成该英雄 base 皮肤的名字（从游戏 skin0.bin 里读出来，不能猜）；
 *   4. `objectPath` 也改成 `Characters/<角色>/Skins/Skin0`（entry 自己的身份路径）。
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
import { ritobinHash } from './ritobin';

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
  /** `SkinCharacterDataProperties.objectPath` 有没有换成 base 皮肤自己的路径 */
  objectPathRenamed: boolean;
  /** 有没有把「目标不在本包里」的 `skinUpgradeData` 去掉 */
  upgradeDropped: boolean;
  /** 被去掉的 gear 对象（`Characters/.../Gear/<名>` 或它的哈希），用来补枪械 submesh / 特效映射 */
  upgradeLinks: string[];
  /** 炫彩（chroma）改成独立皮肤身份时改的 `skinClassification`；不是炫彩就是 undefined */
  classification?: { from: number | null; to: number };
}

export interface RebaseSkinPyOptions {
  /** ritobin 转出来的 .py 文件 */
  pyPath: string;
  /** 角色目录名，例如 vayne / jade_vayne */
  character: string;
  /** 该角色 base 皮肤的 championSkinName，例如 VayneBase */
  baseChampionSkinName: string;
  /** 这个皮肤的皮肤 id（69），用来算 `objectPath` 的旧值 */
  skinId?: number;
  /** base 皮肤 bin 里的 `skeleton` 字符串（游戏里的写法，大小写照抄） */
  baseSkeleton?: string;
  /** base 皮肤 bin 里的 `simpleSkin` 字符串（游戏里的写法，大小写照抄） */
  baseSimpleSkin?: string;
  /** 该角色 base 皮肤（游戏 skin0.bin）的音频段，用来把皮肤音频身份换回 base */
  baseAudio?: AudioBlocks;
  /** base 皮肤 bin 里的 `skinClassification`（独立皮肤是 1，炫彩是 2） */
  baseClassification?: number | null;
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

/** 读一份皮肤 bin 文本里的骨架/网格引用（没有就返回空） */
export const readSkinMeshFields = (
  text: string
): { skeleton?: string; simpleSkin?: string } => ({
  skeleton: readStringField(text, 'skeleton') ?? undefined,
  simpleSkin: readStringField(text, 'simpleSkin') ?? undefined,
});

/** 读出一份皮肤 bin 里引用的网格/骨架路径（没有就返回空） */
export const readSkinMeshRefs = (pyPath: string): string[] => {
  const text = fs.readFileSync(pyPath, 'utf-8');
  const fields = readSkinMeshFields(text);
  return [fields.skeleton, fields.simpleSkin].filter((value): value is string => !!value);
};

const replaceStringField = (text: string, field: string, value: string): string =>
  text.replace(new RegExp(`(${field}:\\s*string\\s*=\\s*")[^"]*(")`), `$1${value}$2`);

const samePath = (left: string, right: string): boolean =>
  left.replace(/\\/g, '/').toLowerCase() === right.replace(/\\/g, '/').toLowerCase();

/**
 * ritobin 的哈希写法：`0x` + 最多 8 位十六进制（**不补前导零**，例如 `0xa538d4c`）。
 *
 * 我们自己的 `ritobinHash()` 补到 8 位，所以比较/替换时都要按数值比，不能直接按字符串比。
 */
const HEX_TOKEN = '0x[0-9a-f]{1,8}';
const hashPattern = (hash: string): string =>
  `0x0*${hash.replace(/^0+/, '')}(?![0-9a-f])`;
const normalizeHash = (token: string): string => token.slice(2).toLowerCase().padStart(8, '0');

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `"路径"` -> `路径`；哈希或没引号返回 null */
const unquote = (token: string): string | null =>
  token.length > 1 && token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : null;

/** py 里所有 entry key 的哈希（字符串 key 也按 ritobin 的 FNV-1a 算成哈希） */
const entryHashes = (text: string): Set<string> => {
  const hashes = new Set<string>();
  const pattern = new RegExp(
    `^ {4}(?:"([^"\\n]+)"|(${HEX_TOKEN})) = [\\w.<>\\[\\], ]+ \\{`,
    'gm'
  );
  for (const matched of text.matchAll(pattern)) {
    if (matched[1]) {
      hashes.add(ritobinHash(matched[1]));
    } else if (matched[2]) {
      hashes.add(normalizeHash(matched[2]));
    }
  }
  return hashes;
};

/** 从 `start` 所在行开始，找到配对 `}` 之后的位置（找不到返回 -1） */
const blockEnd = (text: string, start: number): number => {
  const open = text.indexOf('{', start);
  if (open === -1) {
    return -1;
  }
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    if (text[at] === '{') {
      depth++;
    } else if (text[at] === '}') {
      depth--;
      if (depth === 0) {
        return at + 1;
      }
    }
  }
  return -1;
};

/**
 * 把 `SkinCharacterDataProperties.objectPath` 换成 base 皮肤自己的路径。
 *
 * entry key 改成 `Characters/<角色>/Skins/Skin0` 之后，这条 entry 自己的
 * `objectPath` 还是 `.../Skin<N>`。游戏自带的 base `skin0.bin` 里是 `.../Skin0`，
 * Rose 的 21069 包也把这一处改成了 Skin0（`patchPyFile()` 只改 key，不改这里）。
 *
 * 传进来的值可能是完整字符串（完整名字表），也可能是 `0x...` 哈希（精简名字表），
 * 两种都换；判定用「值的哈希是不是旧路径的哈希」，不会误伤别的字段。
 */
export const rebaseSkinObjectPath = (
  text: string,
  character: string,
  skinId: number
): { text: string; replaced: number } => {
  const own = `characters/${character}/skins/skin`;
  const oldHash = ritobinHash(`${own}${skinId}`);
  const newHash = ritobinHash(`${own}0`);
  let replaced = 0;
  let next = text.replace(new RegExp(hashPattern(oldHash), 'gi'), () => {
    replaced++;
    return `0x${newHash}`;
  });
  next = next.replace(/"([^"\n]+)"/g, (matched, value: string) => {
    if (ritobinHash(value) !== oldHash) {
      return matched;
    }
    replaced++;
    return `"${value.replace(/Skin\d+$/i, 'Skin0')}"`;
  });
  return { text: next, replaced };
};

/**
 * 炫彩（chroma）的身份：`skinParent` = 父皮肤 id，`skinClassification` = 2。
 *
 * 这两个字段在「独立皮肤」里不存在（`skinClassification` 是 1）。炫彩的数据本来是
 * 给游戏「和父皮肤一起加载」用的，我们把它塞进 base 皮肤槽位后，父皮肤不在，
 * 游戏仍然按炫彩处理这份数据 —— 实测 68_9（68009，父皮肤 68004）走路和模型都对，
 * 但 Q/E/R 的特效没了/歪了：Rumble 的技能特效是动画图里 `mEffectKey` 事件经皮肤
 * `Resources.resourceMap` 解析成粒子的，炫彩身份下这条解析链拿不到父皮肤上下文。
 *
 * 处理：把炫彩按「独立皮肤」的身份写 —— `skinClassification` 换成 base 皮肤的值
 * （独立皮肤 / base 都是 1）；`skinParent` 留着（Rose 的包也留着，游戏不会因为它
 * 去找不存在的父皮肤数据）。
 */
const SKIN_PARENT_FIELD = `(?:skinParent|${hashPattern(ritobinHash('skinParent'))})`;
const SKIN_CLASSIFICATION_FIELD = `(?:skinClassification|${hashPattern(
  ritobinHash('skinClassification')
)})`;

/** 读 `skinParent`（没有这个字段返回 null，独立皮肤就是这样） */
export const readSkinParent = (text: string): number | null => {
  const matched = new RegExp(`${SKIN_PARENT_FIELD}:\\s*i32\\s*=\\s*(-?\\d+)`).exec(text);
  return matched ? Number(matched[1]) : null;
};

/** 读 `skinClassification` */
export const readSkinClassification = (text: string): number | null => {
  const matched = new RegExp(`${SKIN_CLASSIFICATION_FIELD}:\\s*u32\\s*=\\s*(\\d+)`).exec(text);
  return matched ? Number(matched[1]) : null;
};

/**
 * 炫彩（有 `skinParent`）的 `skinClassification` 换成独立皮肤的值（默认 1）。
 *
 * 不是炫彩的皮肤原样返回 —— 传说/终极皮肤的分类（走路、专属动作）不能被抹平。
 */
export const normalizeChromaClassification = (
  text: string,
  baseClassification?: number | null
): { text: string; changed: boolean; from: number | null; to: number } => {
  const parent = readSkinParent(text);
  const from = readSkinClassification(text);
  const to = baseClassification ?? 1;
  if (parent === null || parent <= 0 || from === null || from === to) {
    return { text, changed: false, from, to };
  }
  const field = new RegExp(`(${SKIN_CLASSIFICATION_FIELD}:\\s*u32\\s*=\\s*)\\d+`);
  return { text: text.replace(field, `$1${to}`), changed: true, from, to };
};

/**
 * 去掉「目标不在本包里」的 `skinUpgradeData`（gear 形态升级）。
 *
 * `skinUpgradeData.mGearSkinUpgrades` 是一串 link，指向 gear 对象
 * （`Characters/<角色>/Skins/Skin<N>/Gear/<名>`）。这类对象对一部分皮肤在
 * 「多皮肤」bin 里（不随皮肤包走）；换成 base 皮肤后 gear 系统本来也用不了。
 * Rose 的 21069 包把整段去掉了；我们的包留着它时，游戏里走路和技能都不播动画。
 *
 * 目标对象还在本包里的皮肤（例如 21016、99007 的 bin 自带 gear 对象）保持原样。
 */
export const dropDanglingSkinUpgrade = (
  text: string
): { text: string; dropped: boolean; links: string[] } => {
  // 精简名字表里这几个名字解不出来时是 `0x...` 哈希，两种写法都认
  // （`skinUpgradeData` 和 `SkinUpgradeData` 哈希相同，ritobin 印哪个都行）
  const field = `(?:[Ss]kinUpgradeData|${hashPattern(ritobinHash('skinUpgradeData'))})`;
  const head = new RegExp(`^([ \\t]*)${field}: embed = ${field} \\{\\s*$`, 'm').exec(text);
  if (!head) {
    return { text, dropped: false, links: [] };
  }
  const start = head.index;
  const end = blockEnd(text, start);
  if (end < 0) {
    return { text, dropped: false, links: [] };
  }
  const block = text.slice(start, end);
  const links: string[] = [];
  const listField = `(?:mGearSkinUpgrades|${hashPattern(ritobinHash('mGearSkinUpgrades'))})`;
  const list = new RegExp(`${listField}: list\\[link\\] = \\{([\\s\\S]*?)\\}`, 'm').exec(block);
  if (list) {
    for (const matched of list[1].matchAll(new RegExp(`"([^"\\n]+)"|(${HEX_TOKEN})`, 'gi'))) {
      links.push(matched[1] ?? matched[2]);
    }
  }
  const known = entryHashes(text);
  const resolvable = links.some((link) =>
    link.startsWith('0x') ? known.has(normalizeHash(link)) : known.has(ritobinHash(link))
  );
  if (links.length === 0 || resolvable) {
    return { text, dropped: false, links };
  }
  // 连同这一行的缩进和后面的换行一起删掉
  let cutEnd = end;
  if (text[cutEnd] === '\r') {
    cutEnd++;
  }
  if (text[cutEnd] === '\n') {
    cutEnd++;
  }
  return { text: text.slice(0, start) + text.slice(cutEnd), dropped: true, links };
};

/**
 * 找到 gear 对象（`link` 指的那条 entry）的文本块；没有返回 null。
 *
 * 名字表不同时 entry key 可能是 `0x...` 哈希、也可能是完整路径字符串，所以这里
 * 挨个算出每条 entry 的哈希再比，不依赖 key 的写法。
 */
const gearEntryBlock = (text: string, link: string): string | null => {
  const target = link.startsWith('0x') ? normalizeHash(link) : ritobinHash(link);
  const head = new RegExp(`^ {4}("[^"\\n]+"|${HEX_TOKEN}) = `, 'gm');
  for (const matched of text.matchAll(head)) {
    // 捕获组带引号，算哈希前要剥掉
    const key = matched[1].startsWith('"') ? matched[1].slice(1, -1) : matched[1];
    const hash = key.startsWith('0x') ? normalizeHash(key) : ritobinHash(key);
    if (hash !== target) {
      continue;
    }
    const start = matched.index ?? 0;
    const end = blockEnd(text, start);
    return end < 0 ? null : text.slice(start, end);
  }
  return null;
};

/**
 * 从 gear 对象的 py 里读 `mCharacterSubmeshesToShow`，返回哈希。
 *
 * gear 对象不在皮肤包里（在「多皮肤」bin 里），要去游戏 WAD 取出来转文本再看。
 * 返回值统一成 FNV-1a 哈希，方便和 `initialSubmeshToHide` 里的名字对照（名字可能解不出来）。
 */
export const readGearShowList = (text: string, link: string): string[] | null => {
  const block = gearEntryBlock(text, link);
  if (block === null) {
    return null;
  }
  const field = `(?:mCharacterSubmeshesToShow|${hashPattern(ritobinHash('mCharacterSubmeshesToShow'))})`;
  const list = new RegExp(`${field}: list\\[hash\\] = \\{([\\s\\S]*?)\\}`, 'm').exec(block);
  if (!list) {
    return [];
  }
  const hashes: string[] = [];
  for (const matched of list[1].matchAll(new RegExp(`"([^"\\n]+)"|(${HEX_TOKEN})`, 'gi'))) {
    hashes.push(matched[1] ? ritobinHash(matched[1]) : normalizeHash(matched[2]));
  }
  return hashes;
};

/**
 * 把 `initialSubmeshToHide` 里命中的 submesh 去掉（让它们从一开始就显示）。
 *
 * 为什么要做：皮肤 bin 的 `initialSubmeshToHide` 把 A/B/C 三套枪全藏起来，靠 gear 系统
 * （`skinUpgradeData`）在游戏里按当前档位显示一套。我们把那块数据去掉之后没人再显示它们，
 * 模型就少两把枪。Rose 的 21069 包把「第一档 gear 会显示的那两个 submesh」从隐藏列表里
 * 删了 —— 这里做同样的事（`hashes` 来自 `readGearShowList`）。
 */
export const unhideSubmeshes = (
  text: string,
  hashes: string[]
): { text: string; removed: string[] } => {
  const wanted = new Set(
    hashes.map((hash) => {
      if (hash.startsWith('0x')) {
        return normalizeHash(hash);
      }
      // 不带 0x 的纯十六进制（`readGearShowList` 的返回值）按哈希处理，别当名字再哈希一次
      return /^[0-9a-f]{1,8}$/i.test(hash) ? hash.toLowerCase().padStart(8, '0') : ritobinHash(hash);
    })
  );
  // 精简名字表里 `initialSubmeshToHide` 也可能印成哈希，两种都认
  const field = new RegExp(
    `((?:initialSubmeshToHide|${hashPattern(ritobinHash('initialSubmeshToHide'))}): string = ")([^"]*)(")`
  );
  const matched = field.exec(text);
  if (!matched || wanted.size === 0) {
    return { text, removed: [] };
  }
  const names = matched[2].split(/\s+/).filter(Boolean);
  const removed = names.filter((name) => wanted.has(ritobinHash(name)));
  if (removed.length === 0) {
    return { text, removed: [] };
  }
  const kept = names.filter((name) => !wanted.has(ritobinHash(name)));
  return { text: text.replace(field, `$1${kept.join(' ')}$3`), removed };
};

/**
 * 从 gear 对象的 py 里读 `mVFXResourceResolver.resourceMap`（`key = link` 对）。
 *
 * 这张表是 gear 系统给「枪上的特效」用的：`MissFortune_W_Buf_LWeapon` / `W_Max` /
 * `P_Buff` 这些 key 在皮肤自己的 `Resources` 里是 `0x0`（空），靠 gear 补。去掉 gear
 * 之后 W 的枪口特效就没了，所以要把这些映射补进皮肤自己的 `Resources`。
 * key / value 都按 py 里的原样返回（可能是 `0x...` 哈希，也可能是 `"路径"`）。
 */
export interface GearVfxPair {
  /** py 里的 key 原样（`"名字"` 或 `0x...`） */
  key: string;
  /** py 里的 value 原样（`"路径"` 或 `0x...`） */
  value: string;
  /** value 指向的粒子路径（value 是哈希时用 bin 里的 entry 反查出来） */
  path?: string;
}

/**
 * 从 gear 对象的 py 里读 `mVFXResourceResolver.resourceMap`（`key = link` 对）。
 *
 * 这张表是 gear 系统给「枪上的特效」用的：`MissFortune_W_Buf_LWeapon` / `W_Max` /
 * `P_Buff` 这些 key 在皮肤自己的 `Resources` 里是 `0x0`（空），靠 gear 补。去掉 gear
 * 之后 W 的枪口特效就没了，所以要把这些映射补进皮肤自己的 `Resources`。
 *
 * value 是哈希时用同一份 py 里的 entry key 反查出粒子路径（名字表不全时 value 解不出来，
 * 但 entry key 往往是完整路径），后面才能按路径反推「皮肤里那个 key 的哈希」。
 */
export const readGearVfxMap = (text: string, link: string): GearVfxPair[] | null => {
  const block = gearEntryBlock(text, link);
  if (block === null) {
    return null;
  }
  const field = `(?:mVFXResourceResolver|${hashPattern(ritobinHash('mVFXResourceResolver'))})`;
  // 只截「从 mVFXResourceResolver 开始」的那一段，避免把 entry 里别的 resourceMap 读进来
  const at = new RegExp(`${field}:`, 'm').exec(block);
  const scope = at ? block.slice(at.index) : block;
  const mapField = `(?:resourceMap|${hashPattern(ritobinHash('resourceMap'))})`;
  const map = new RegExp(`${mapField}: map\\[hash, link\\] = \\{([\\s\\S]*?)\\}`, 'm').exec(scope);
  if (!map) {
    return [];
  }
  // 整份 py 的 entry：hash -> 路径（value 是哈希时用来反查）
  const pathByHash = new Map<string, string>();
  const entryLine = new RegExp(`^ {4}"([^"\\n]+)" = `, 'gm');
  for (const matched of text.matchAll(entryLine)) {
    pathByHash.set(ritobinHash(matched[1]), matched[1]);
  }
  // 名字表不全时 entry key 是哈希，但粒子的 `particlePath` 是字符串字段，一直是完整路径：
  // 用它把 value 的哈希反查成路径
  for (const matched of text.matchAll(/particlePath: string = "([^"]+)"/g)) {
    pathByHash.set(ritobinHash(matched[1]), matched[1]);
  }
  const pairs: GearVfxPair[] = [];
  const line = new RegExp(
    `^\\s+("[^"\\n]+"|${HEX_TOKEN}) = ("[^"\\n]+"|${HEX_TOKEN})\\s*$`,
    'gm'
  );
  for (const matched of map[1].matchAll(line)) {
    const pair: GearVfxPair = { key: matched[1], value: matched[2] };
    pair.path =
      unquote(pair.value) ??
      (pair.value.startsWith('0x')
        ? pathByHash.get(normalizeHash(pair.value))
        : undefined);
    pairs.push(pair);
  }
  return pairs;
};

/**
 * 把 gear 的 `resourceMap` 映射补进皮肤自己的 `Resources` entry（只补值为 `0x0` 的 key）。
 *
 * 皮肤 bin 里这些 key 都是空的，运行时靠 gear 补；gear 没了就补不回来 —— 见 `readGearVfxMap`。
 */
export const applyGearVfxMap = (
  text: string,
  pairs: GearVfxPair[]
): { text: string; mapped: string[] } => {
  if (pairs.length === 0) {
    return { text, mapped: [] };
  }
  const head = new RegExp(
    `^ {4}(?:"([^"\\n]+\\/Resources)"|${HEX_TOKEN}) = ResourceResolver \\{`,
    'm'
  ).exec(text);
  if (!head) {
    return { text, mapped: [] };
  }
  const end = blockEnd(text, head.index);
  if (end < 0) {
    return { text, mapped: [] };
  }
  // key 在两边可能一边印成路径、一边印成哈希，统一按哈希对上再补值；
  // 另外「皮肤里的 key 名」和「gear 里的 key 名」不一定是同一套写法
  // （gear 里有几个 key 解不出来），所以再从 value 的粒子路径反推出 key 名：
  // `.../MissFortune_Skin69_W_Buf_LWeapon00` -> `MissFortune_W_Buf_LWeapon`
  const valueByHash = new Map<string, string>();
  for (const pair of pairs) {
    const keyName = unquote(pair.key);
    const keyHash = pair.key.startsWith('0x')
      ? normalizeHash(pair.key)
      : ritobinHash(keyName ?? pair.key);
    const value = pair.path ? `"${pair.path}"` : pair.value;
    valueByHash.set(keyHash, value);
    if (!pair.path) {
      continue;
    }
    const base = (pair.path.split('/').pop() ?? '').replace(/\d+$/, '');
    if (!base) {
      continue;
    }
    for (const candidate of [base, base.replace(/_skin\d+_/i, '_')]) {
      valueByHash.set(ritobinHash(candidate), value);
    }
  }
  const block = text.slice(head.index, end);
  const emptyValue = new RegExp(`^(\\s*)("[^"\\n]+"|${HEX_TOKEN}) = 0x0\\s*$`);
  const mapped: string[] = [];
  const nextBlock = block
    .split('\n')
    .map((line) => {
      const matched = emptyValue.exec(line);
      if (!matched) {
        return line;
      }
      const key = matched[2];
      const keyName = unquote(key);
      const keyHash = key.startsWith('0x')
        ? normalizeHash(key)
        : ritobinHash(keyName ?? key);
      const value = valueByHash.get(keyHash);
      if (!value) {
        return line;
      }
      mapped.push(keyName ?? key);
      return `${matched[1]}${key} = ${value}`;
    })
    .join('\n');
  if (mapped.length === 0) {
    return { text, mapped };
  }
  return { text: text.slice(0, head.index) + nextBlock + text.slice(end), mapped };
};

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
    // 引用字符串优先用游戏 base skin0.bin 里的原写法：`ASSETS/Characters/MissFortune/...`
    // 的 CamelCase 和我们从目录名拼出来的（`Missfortune`）不一样，能照抄就照抄
    const baseReference = kind === 'skl' ? options.baseSkeleton : options.baseSimpleSkin;
    const reference =
      baseReference ?? `ASSETS/Characters/${hero}/Skins/Base/${hero}.${kind}`;
    // 打包目录里的路径由引用推出来：`ASSETS/...` -> `assets/...`
    const targetRelative = reference
      .replace(/^ASSETS\//i, 'assets/')
      .replace(/\\/g, '/')
      .toLowerCase();
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
  // championSkinId 保留：游戏自带的 base skin0.bin 里也有它（Sona 是 37000），
  // Rose 的 rebase 也不删。多形态皮肤（skinUpgradeData 的 gear form）和音频都靠它
  // 绑定到「哪个皮肤」，删掉会让游戏把这份数据当成没有皮肤身份的数据，形态/音效起不来。
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

  // objectPath：**不换**。base-slot 包的身份对象留在原皮肤的命名空间
  // （`Characters/<英雄>/Skins/Skin<N>`），和 Rose 的 68003 包一致 —— 它把 entry key、
  // `mResourceResolver` 换成 Skin0/Resources，但 objectPath 仍是 `Skins/Skin3`。
  // 改成 Skin0 会让「特效按皮肤命名空间解析」这条链对不上（Q 火焰落点歪、E/R 没特效）。
  const objectPathRenamed = false;
  // gear 形态升级：目标对象不在本包里的整段去掉（理由见 dropDanglingSkinUpgrade）
  const upgrade = dropDanglingSkinUpgrade(next);
  next = upgrade.text;
  // 炫彩当成独立皮肤写（理由见 normalizeChromaClassification）
  const classified = normalizeChromaClassification(next, options.baseClassification);
  next = classified.text;

  fs.writeFileSync(options.pyPath, next, 'utf-8');

  log(
    `[base-skin] ${character}: championSkinName=${options.baseChampionSkinName}，` +
      `skeleton=${skeletonRef}，simpleSkin=${simpleSkinRef}`
  );
  if (upgrade.dropped) {
    log(
      `[base-skin] ${character}: 去掉 skinUpgradeData（gear 目标不在本包里：` +
        `${upgrade.links.slice(0, 3).join(', ')}）`
    );
  }
  if (classified.changed) {
    log(
      `[base-skin] ${character}: 炫彩按独立皮肤写（skinClassification ` +
        `${classified.from} -> ${classified.to}）`
    );
  }
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
    objectPathRenamed,
    upgradeDropped: upgrade.dropped,
    upgradeLinks: upgrade.links,
    classification: classified.changed
      ? { from: classified.from, to: classified.to }
      : undefined,
  };
};
