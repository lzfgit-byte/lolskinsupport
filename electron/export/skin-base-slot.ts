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

/** 条目 key（字符串 key 和 `0x…` key 都算），小写 */
export const collectEntryKeys = (text: string): string[] =>
  Array.from(text.matchAll(/^ {4}(?:"([^"]*)"|(0x[0-9a-fA-F]+)) = /gm)).map((match) =>
    (match[1] ?? match[2]).toLowerCase()
  );

/** `map[hash, link]` 里的取值（`0xkey = 0xvalue`，任意缩进） */
export const readMapValues = (text: string): string[] =>
  Array.from(text.matchAll(/^\s+0x[0-9a-fA-F]+ = (0x[0-9a-fA-F]+)$/gm)).map((match) =>
    match[1].toLowerCase()
  );

/** `link = 0x…` / `effectKey: hash = 0x…` 这类「指向别处」的引用 */
export const readHashRefs = (text: string): { kind: 'link' | 'hash'; value: string }[] =>
  Array.from(text.matchAll(/\b(link|hash) = (0x[0-9a-fA-F]+)\b/g)).map((match) => ({
    kind: match[1] as 'link' | 'hash',
    value: match[2].toLowerCase(),
  }));

/**
 * 把「本 bin 的 `Resources` 指向、但条目定义在别的 bin 里」的条目搬进来。
 *
 * 为什么需要：base-slot 的 bin 只留身份 + `Resources`（builder 7），可 `Resources`
 * 的 `map[hash, link]` 里有些 value 不是文件路径 hash，而是**同一个 bin 里的条目 key**
 * （Rumble 的 `0x6f608837 = 0xa075fcc1`，指向 `VfxSystemDefinitionData`）。这些条目在
 * 原皮肤 bin 里，随包一起加载，但 props 的解析只认**自己这个 bin** 的条目 —— 不搬进来就是
 * 断链，游戏里表现为特效/系统解析不到。以前这一份是照着能跑的手改包手抄的（1,471 行），
 * 现在按 hash 从随包的皮肤 bin 里取游戏自己那份，生成时自动完成。
 *
 * **只搬 `keys` 点名的**，不做「凡是能解析到的都搬」：Rumble 的 resolver 里有 50 个 value
 * 能对上皮肤 bin 的条目，全搬等于把整份粒子内嵌回 base bin，正是 builder 7 验证过会破坏
 * 特效链的老做法。`keys` 由需要它们的调用方给（目前是英雄补丁里 `resourceMap.set` 的目标）。
 */
export const copyResolvedEntries = (
  text: string,
  sources: { label: string; text: string }[],
  options: { keys: string[]; classes?: string[] }
): SlotEdit & { copied: { key: string; className: string; from: string }[] } => {
  const copied: { key: string; className: string; from: string }[] = [];
  const lines = text.split('\n');
  const entriesStart = lines.findIndex((line) => /^entries: map\[hash, embed\] = \{/.test(line));
  if (entriesStart < 0) return { ...emptyEdit(text), copied };
  const have = new Set(collectEntryKeys(text));
  const wanted = Array.from(new Set(options.keys.map((key) => key.trim().toLowerCase()))).filter(
    (key) => /^0x[0-9a-f]+$/.test(key) && !have.has(key)
  );
  if (wanted.length === 0) return { ...emptyEdit(text), copied };

  const blocks: string[] = [];
  for (const hash of wanted) {
    for (const source of sources) {
      const sourceLines = source.text.split('\n');
      const at = sourceLines.findIndex((line) =>
        new RegExp(`^ {4}${hash} = `).test(line)
      );
      if (at < 0) continue;
      const head = /^ {4}0x[0-9a-fA-F]+ = (\w+) \{/.exec(sourceLines[at]);
      const className = head ? head[1] : '';
      if (options.classes && className && !options.classes.includes(className)) continue;
      const stop = blockEnd(sourceLines, at);
      blocks.push(...sourceLines.slice(at, stop + 1));
      copied.push({ key: hash, className, from: source.label });
      have.add(hash);
      break;
    }
  }
  if (blocks.length === 0) return { ...emptyEdit(text), copied };

  const end = blockEnd(lines, entriesStart);
  const out = [...lines.slice(0, end), ...blocks, ...lines.slice(end)];
  return { text: out.join('\n'), removed: [], added: [], copied };
};

/** 取一个条目里的所有 `VfxEmitterDefinitionData` 块（相对缩进归零，便于比较/重排） */
const emitterBlocks = (block: string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < block.length; i++) {
    if (!/VfxEmitterDefinitionData \{/.test(block[i])) continue;
    const base = indentOf(block[i]);
    let depth = 0;
    const lines: string[] = [];
    for (let j = i; j < block.length; j++) {
      for (const ch of block[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      lines.push(block[j].slice(base));
      if (depth === 0) {
        i = j;
        break;
      }
    }
    out.push(lines.join('\n'));
  }
  return out;
};

const entryBlockLines = (lines: string[], key: string): string[] | null => {
  const start = lines.findIndex((line) => new RegExp(`^ {4}${key} = `).test(line));
  if (start < 0) return null;
  return lines.slice(start, blockEnd(lines, start) + 1);
};

/**
 * 把「伴随系统」的 emitter 并进主系统。
 *
 * 游戏把同一个技能特效拆成多个系统：Rumble 的 R 地面是 `…_R_tar_team_green`（13 个
 * emitter）**加上** 6 个独立的 `…_R_Crater_01..06`（各 1 个 emitter）。base-slot 的
 * 条件一次只能挂一个系统，只挂 tar 那个在游戏里几乎看不见 —— 实测 R 完全没有效果。
 * 能跑的包里是把 6 个裂坑的 emitter 直接并进 tar 系统（逐字节相同）。
 *
 * 这里做的同一件事，但并体来源是**游戏数据**（随包的皮肤 bin），补丁只写规则：
 * `{ key: '0xa075fcc1', alsoByName: 'Rumble_Skin03_R_Crater_' }` —— 名字前缀在生成时
 * 展开成具体条目，补丁里没有任何 emitter 定义。
 */
export const composeEmitters = (
  text: string,
  sources: { label: string; text: string }[],
  specs: { key: string; also?: string[]; alsoByName?: string }[]
): SlotEdit & { merged: { key: string; from: string[] }[] } => {
  const merged: { key: string; from: string[] }[] = [];
  let current = text;
  for (const spec of specs) {
    const lines = current.split('\n');
    const target = entryBlockLines(lines, spec.key.toLowerCase());
    if (!target) continue;
    const targetStart = lines.indexOf(target[0]);
    const listAt = lines.findIndex(
      (line, index) =>
        index >= targetStart &&
        index < targetStart + target.length &&
        /^\s*complexEmitterDefinitionData: list\[pointer\] = \{/.test(line)
    );
    if (listAt < 0) continue;
    const listEnd = blockEnd(lines, listAt);
    const emitterIndent = ' '.repeat(indentOf(lines[listAt]) + 4);
    const existing = new Set(
      emitterBlocks(lines.slice(listAt, listEnd + 1)).map((item) => item.trim())
    );

    const additions: string[] = [];
    const from: string[] = [];
    for (const source of sources) {
      const sourceLines = source.text.split('\n');
      const keys = (spec.also ?? []).map((key) => key.toLowerCase());
      if (spec.alsoByName) {
        for (const line of sourceLines) {
          if (!/^ {4}0x[0-9a-fA-F]+ = /.test(line)) continue;
          const key = line.slice(4).split(' = ')[0];
          const block = entryBlockLines(sourceLines, key);
          if (!block) continue;
          if (!block.join('\n').includes(`particleName: string = "${spec.alsoByName}`)) continue;
          if (!keys.includes(key)) keys.push(key);
        }
      }
      for (const key of keys) {
        const block = entryBlockLines(sourceLines, key);
        if (!block) continue;
        for (const emitter of emitterBlocks(block)) {
          if (existing.has(emitter.trim())) continue;
          existing.add(emitter.trim());
          additions.push(...emitter.split('\n').map((line) => `${emitterIndent}${line}`));
          if (!from.includes(key)) from.push(key);
        }
      }
    }
    if (additions.length === 0) continue;
    current = [...lines.slice(0, listEnd), ...additions, ...lines.slice(listEnd)].join('\n');
    merged.push({ key: spec.key, from });
  }
  return { text: current, removed: [], added: [], merged };
};

/**
 * 诊断：`Resources` 里那些「其实指向某个条目」的 value，有多少在本 bin 里解析不到。
 *
 * `resourceMap` 的 value 大多数是文件路径 hash（贴图、粒子文件），少数是**条目 key**
 * （同 bin 里的 `VfxSystemDefinitionData` 之类）。后者如果没被搬进 base bin，props 就解析
 * 不到 —— 这正是 Rumble 的 R 燃烧特效缺的那一层（`0x6f608837 = 0xa075fcc1`，皮肤 bin 里
 * 有定义，base bin 里没有）。
 *
 * 只做这一种判断：value 在本 bin 里没有、在随包其它 bin 里**有条目** → 报出来。文件路径
 * hash 一律不判（没法确定在不在 WAD 里，全是误报）。
 */
export const findUnresolvedResourceRefs = (
  text: string,
  sources: { label: string; text: string }[]
): { value: string; className: string; from: string }[] => {
  const have = new Set(collectEntryKeys(text));
  const out: { value: string; className: string; from: string }[] = [];
  const seen = new Set<string>();
  for (const value of readMapValues(text)) {
    if (have.has(value) || seen.has(value)) continue;
    for (const source of sources) {
      const line = source.text
        .split('\n')
        .find((item) => new RegExp(`^ {4}${value} = `).test(item));
      if (!line) continue;
      const head = /^ {4}0x[0-9a-fA-F]+ = (\w+) \{/.exec(line);
      if (!head) continue;
      seen.add(value);
      out.push({ value, className: head[1], from: source.label });
      break;
    }
  }
  return out;
};

