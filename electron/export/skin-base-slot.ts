/**
 * base-slot 皮肤包的「外壳」重建（builder 7）。
 *
 * 依据 Rose 的 `skins/68/68003/68003.fantome` —— 这份包在游戏里跑通过，我们逐条比对后
 * 把它的结构固化成规则（不按英雄特判，全部由数据决定）：
 *
 * 1. `skins/skin0.bin` 里只留「身份对象（SkinCharacterDataProperties）+ Resources」两个
 *    entry。粒子、动画图、多皮肤数据仍由该皮肤自己的 `skins/skin<N>.bin` 和它 linked 的
 *    文件提供 —— 把 53 条粒子塞进 base bin 的那套（builder ≤ 6）会让整条特效解析链
 *    对不上（Q 火焰落点歪、E 火箭和 R 特效不见）。
 * 2. `objectPath` 留在原皮肤的命名空间（`Characters/<英雄>/Skins/Skin<N>`），补
 *    `skinParent = 0`，去掉 `championSkinId`（Rose 的包里也没有这个字段）。
 * 3. `linked` = 本皮肤 bin 的清单 ∪ 游戏 base `skin0.bin` 的清单。base 的清单里有本皮肤
 *    bin 没列的多皮肤 bin，`Resources` 里指向 `Skins/Skin0/Particles/...` 的那些 key
 *    就定义在里面，少了它们 R 的火箭、E 的施法特效会解析不到。
 * 4. 该皮肤自己的 bin 要整份随包（覆盖同路径），并把 `keywordsRequired` 里含原皮肤名的
 *    闸门删掉：粒子按「皮肤 tag / 皮肤名」过滤，base-slot 的身份拿不到原皮肤的 tag，
 *    不删的话 E 的火箭、推进器、Q/R 命中这些 emitter 一个都不渲染。`keywordsExcluded`
 *    必须原样保留 —— 那是「这个皮肤不要渲染」的排除，删掉会让 base 皮肤的光晕、命中
 *    特效一直挂在脚下。
 * 5. `idleParticlesEffects` 里 `boneName` 不在本皮肤骨架里的条目删掉：挂点不存在时游戏
 *    把这些特效果塌到模型原点（脚下），Rumble 那团「一直出现的闪电」就是 `Idle_taze_01`
 *    （骨头 Spike）和 `Idle_shortcircuit_01`（骨头 robot_root）。
 */

/** 一次文本改写的结果 */
export interface SlotEdit {
  text: string;
  /** 被删掉/加上的东西，给日志用 */
  removed: string[];
  added: string[];
}

const emptyEdit = (text: string): SlotEdit => ({ text, removed: [], added: [] });

const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * 从 `start` 行开始，按花括号配对数到块结束（返回结束行下标，含）。
 * ritobin 的文本里 `{` `}` 只会出现在结构里，字符串里没有花括号，够用。
 */
const blockEnd = (lines: string[], start: number): number => {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth <= 0 && i >= start) return i;
  }
  return lines.length - 1;
};

const quotedTokens = (text: string): string[] =>
  Array.from(text.matchAll(/"([^"]*)"/g)).map((match) => match[1]);

/** 顶层条目 key（`    "Characters/…" = …`） */
const entryKeys = (text: string): string[] =>
  Array.from(text.matchAll(/^ {4}"([^"]*)" = /gm)).map((match) => match[1]);

/** 读出某个 class 的 entry key（例如 SkinCharacterDataProperties / ResourceResolver） */
export const readEntryKeyOfClass = (text: string, className: string): string | null => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = /^ {4}"([^"]*)" = ([A-Za-z_0-9]+) \{/.exec(lines[i]);
    if (match && match[2] === className) return match[1];
  }
  return null;
};

/** `linked: list[string] = { … }` 里的路径 */
export const readLinkedBins = (text: string): string[] => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^\s*linked: list\[string\] = \{/.test(line));
  if (start < 0) return [];
  const end = blockEnd(lines, start);
  return quotedTokens(lines.slice(start, end + 1).join('\n'));
};

export const readChampionSkinName = (text: string): string => {
  const match = /championSkinName:\s*string\s*=\s*"([^"]*)"/.exec(text);
  return match ? match[1] : '';
};

/**
 * 把 `linked` 补成「本皮肤清单 ∪ 额外清单」（大小写不敏感去重，WAD 路径本来就不区分）。
 */
export const mergeLinkedBins = (text: string, extra: string[]): SlotEdit => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^\s*linked: list\[string\] = \{/.test(line));
  if (start < 0) return emptyEdit(text);
  const end = blockEnd(lines, start);
  const existing = quotedTokens(lines.slice(start, end + 1).join('\n'));
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  const added: string[] = [];
  for (const link of extra) {
    if (!link) continue;
    const key = link.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(link);
  }
  if (added.length === 0) return emptyEdit(text);
  const rebuilt = [
    ...lines.slice(0, start + 1),
    ...existing.map((link) => `    "${link}"`),
    ...added.map((link) => `    "${link}"`),
    ...lines.slice(end),
  ];
  return { text: rebuilt.join('\n'), removed: [], added };
};

/**
 * 删 `championSkinId`：base-slot 的身份是「这个英雄的 base 皮肤」，留着原皮肤的 id 会
 * 让多形态（gear form）按原皮肤去找目标，Rose 的包也没有这个字段。
 */
export const dropChampionSkinId = (text: string): SlotEdit => {
  const lines = text.split('\n');
  const removed: string[] = [];
  const kept = lines.filter((line) => {
    if (/^\s*championSkinId: i32 = -?\d+\s*$/.test(line)) {
      removed.push(line.trim());
      return false;
    }
    return true;
  });
  return { text: kept.join('\n'), removed, added: [] };
};

/**
 * 补 `skinParent = 0`（原皮肤若不是炫彩就没有这个字段，Rose 的包里显式写了 0）。
 * 只写进 `SkinCharacterDataProperties` 这个对象里，别碰粒子的 objectPath。
 */
export const ensureSkinParent = (text: string): SlotEdit => {
  if (/^\s*skinParent: i32 = /m.test(text)) return emptyEdit(text);
  const lines = text.split('\n');
  const propsStart = lines.findIndex((line) => /^ {4}"[^"]*" = SkinCharacterDataProperties \{/.test(line));
  if (propsStart < 0) return emptyEdit(text);
  const propsEnd = blockEnd(lines, propsStart);
  const objectPathAt = lines.findIndex(
    (line, index) => index > propsStart && index < propsEnd && /^\s*objectPath: hash = /.test(line)
  );
  if (objectPathAt < 0) return emptyEdit(text);
  const indent = ' '.repeat(indentOf(lines[objectPathAt]));
  const out = [
    ...lines.slice(0, objectPathAt + 1),
    `${indent}skinParent: i32 = 0`,
    ...lines.slice(objectPathAt + 1),
  ];
  return { text: out.join('\n'), removed: [], added: ['skinParent: i32 = 0'] };
};

/**
 * 只留指定的两个 entry（身份对象 + Resources），其余（粒子、CAC 之类）全部删掉。
 * 传进来的 key 由 `readEntryKeyOfClass` 从文本里读，避免拼大小写。
 */
export const stripInlineEntries = (text: string, keepKeys: string[]): SlotEdit => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^entries: map\[hash, embed\] = \{/.test(line));
  if (start < 0) return emptyEdit(text);
  const end = blockEnd(lines, start);
  const keep = new Set(keepKeys);
  const removed: string[] = [];
  const blocks: string[] = [];
  let i = start + 1;
  while (i < end) {
    // 条目 key 在精简名字表下是 `0x…`（没有 binentries 表），patchPyFile 改过的两个才是字符串
    const match = /^ {4}(?:"([^"]*)"|(0x[0-9a-fA-F]+)) = /.exec(lines[i]);
    if (!match) {
      i++;
      continue;
    }
    const key = match[1] ?? match[2];
    const blockStop = blockEnd(lines, i);
    if (keep.has(key)) {
      blocks.push(...lines.slice(i, blockStop + 1));
    } else {
      removed.push(key);
    }
    i = blockStop + 1;
  }
  const out = [...lines.slice(0, start + 1), ...blocks, ...lines.slice(end)];
  return { text: out.join('\n'), removed, added: [] };
};

/**
 * 删掉 VFX 的「皮肤名闸门」。
 *
 * 只处理 `Filtering: pointer = VfxEmitterFiltering { … }` 这种 emitter 上的过滤块：
 * - 有 `keywordsExcluded` 的整块保持原样（那是「这个皮肤不渲染」）；
 * - `keywordsRequired` 里等于原皮肤名的 token 去掉；去掉后列表空了就把整块删掉。
 */
export const dropSkinKeywordGates = (text: string, skinName: string): SlotEdit => {
  if (!skinName) return emptyEdit(text);
  const target = skinName.toLowerCase();
  const lines = text.split('\n');
  const out: string[] = [];
  const removed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('Filtering: pointer = VfxEmitterFiltering')) {
      out.push(lines[i]);
      continue;
    }
    const end = blockEnd(lines, i);
    const block = lines.slice(i, end + 1);
    const blockText = block.join('\n');
    if (/keywordsExcluded/.test(blockText)) {
      out.push(...block);
      i = end;
      continue;
    }
    const requiredMatch = /keywordsRequired: list\[string\] = \{([^}]*)\}/.exec(blockText);
    if (!requiredMatch) {
      out.push(...block);
      i = end;
      continue;
    }
    const tokens = quotedTokens(requiredMatch[1]);
    const remaining = tokens.filter((token) => token.toLowerCase() !== target);
    if (remaining.length === tokens.length) {
      out.push(...block);
      i = end;
      continue;
    }
    if (remaining.length === 0) {
      removed.push(`keywordsRequired { ${tokens.join(', ')} }`);
    } else {
      const indent = ' '.repeat(indentOf(block[0]));
      out.push(
        ...blockText
          .replace(
            requiredMatch[0],
            `keywordsRequired: list[string] = { ${remaining.map((token) => `"${token}"`).join(', ')} }`
          )
          .split('\n')
          .map((line, index) => (index === 0 ? `${indent}${line.trimStart()}` : line))
      );
      removed.push(`keywordsRequired -${tokens.filter((token) => !remaining.includes(token)).join(', ')}`);
    }
    i = end;
  }
  return { text: out.join('\n'), removed, added: [] };
};

/**
 * 删掉挂点骨头不存在的 idle 特效（`SkinCharacterDataProperties_CharacterIdleEffect`）。
 *
 * 这些条目在 game data 里写死了骨头名（Pipe / Rocket / Spike / robot_root …），皮肤的骨架
 * 里没有时就整体塌到模型原点，看着就是「脚下一团东西」。`jointNames` 传骨架里所有关节名
 * （大小写不敏感，和 skl 的 ELF 哈希一致）。
 */
export const dropIdleEffectsWithoutJoints = (
  text: string,
  jointNames: string[]
): SlotEdit & { kept: number } => {
  const joints = new Set(jointNames.map((name) => name.toLowerCase()));
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^\s*idleParticlesEffects: list\[embed\] = \{/.test(line));
  if (start < 0) return { ...emptyEdit(text), kept: 0 };
  const end = blockEnd(lines, start);
  const removed: string[] = [];
  const blocks: string[] = [];
  let kept = 0;
  let i = start + 1;
  while (i < end) {
    if (!lines[i].trim().startsWith('SkinCharacterDataProperties_CharacterIdleEffect {')) {
      i++;
      continue;
    }
    const blockStop = blockEnd(lines, i);
    const block = lines.slice(i, blockStop + 1);
    const boneMatch = /boneName: string = "([^"]*)"/.exec(block.join('\n'));
    const bone = boneMatch ? boneMatch[1] : '';
    if (bone && joints.has(bone.toLowerCase())) {
      blocks.push(...block);
      kept++;
    } else {
      const keyMatch = /effectKey: hash = (.+)/.exec(block.join('\n'));
      removed.push(`${keyMatch ? keyMatch[1].trim() : '?'} @ ${bone || '?'}`);
    }
    i = blockStop + 1;
  }
  if (blocks.length === 0) {
    const indent = ' '.repeat(indentOf(lines[start]));
    const out = [
      ...lines.slice(0, start),
      `${indent}idleParticlesEffects: list[embed] = { }`,
      ...lines.slice(end + 1),
    ];
    return { text: out.join('\n'), removed, added: [], kept: 0 };
  }
  const out = [...lines.slice(0, start + 1), ...blocks, ...lines.slice(end)];
  return { text: out.join('\n'), removed, added: [], kept };
};

export { entryKeys };
