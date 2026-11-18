/**
 * base 皮肤的音频身份改写（对应 Rose 1.5.9 `injection/baseskin/steps.py` 的
 * audio / banks / bankpaths / eventnames 几步 + `audio.py` 的 merge，提交 2c64012d）。
 *
 * 为什么需要：LTK Manager 的 patcher 除了看网格，还会看 bin 里的名字 ——
 * `ChampionSkinName`、`SkinAudioProperties.TagEventList`、`BankUnits[].Name`
 * （`<英雄>_Skin<n>_SFX` 这种）以及非 voiceOver 单位列出的事件名
 * （`Play_sfx_<英雄>Skin<n>_...`）。只要命中「别的皮肤」，照样判 skinhack。
 * 规则见 LTK 的 `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs`
 * （`Markers` / `other_skin_names`）。
 *
 * 这个文件管 bin 文本这一侧（bankUnits / tagEventList 的解析与改写）；
 * bank 里面的别名 Event（保住皮肤专属音效）在 skin-banks.ts。
 *
 * 两种改法（由调用方选）：
 *   - `replaceAudioBlocks`：整段换成游戏 base 皮肤的（最简单，但皮肤专属音效退回 base）；
 *   - `rewriteBankUnits`：保留皮肤自己的 bank 单位，只把名字/事件换成 base 名字
 *     （配合 skin-banks.ts 在 bank 里补别名，音效还是皮肤自己的）。
 */

/** 一份 bin 文本里的两段音频身份 */
export interface AudioBlocks {
  /** `tagEventList: list[string] = { ... }` 的整段原文 */
  tagEventList: string;
  /** `bankUnits: list2[embed] = { ... }` 的整段原文 */
  bankUnits: string;
}

interface Span {
  start: number;
  end: number;
}

/** 从 field 匹配到的位置开始，配对到对应的 `}`（跳过字符串里的花括号） */
const braceSpan = (text: string, field: RegExp): Span | null => {
  const matched = field.exec(text);
  if (!matched) {
    return null;
  }
  const open = matched.index + matched[0].length - 1;
  if (text[open] !== '{') {
    return null;
  }
  const close = braceEnd(text, open);
  return close < 0 ? null : { start: matched.index, end: close + 1 };
};

/** `{` 的位置 -> 配对 `}` 的位置（跳过字符串里的花括号），-1 表示没配对 */
const braceEnd = (text: string, open: number): number => {
  let depth = 0;
  let inString = false;
  for (let at = open; at < text.length; at++) {
    const char = text[at];
    if (inString) {
      if (char === '\\') {
        at++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return at;
      }
    }
  }
  return -1;
};

const TAG_FIELD = /^[ \t]*tagEventList: list\[string\] = \{/m;
const UNITS_FIELD = /^[ \t]*bankUnits: list2\[embed\] = \{/m;

/** 读出一份 bin 文本里的两段音频身份（没有就返回空的那段） */
export const readAudioBlocks = (text: string): AudioBlocks | null => {
  const tags = braceSpan(text, TAG_FIELD);
  const units = braceSpan(text, UNITS_FIELD);
  if (!tags && !units) {
    return null;
  }
  return {
    tagEventList: tags ? text.slice(tags.start, tags.end) : '',
    bankUnits: units ? text.slice(units.start, units.end) : '',
  };
};

const applyBlock = (text: string, field: RegExp, replacement: string): string => {
  if (!replacement) {
    return text;
  }
  const span = braceSpan(text, field);
  return span ? text.slice(0, span.start) + replacement + text.slice(span.end) : text;
};

/**
 * 把 base 皮肤的两段音频身份覆盖到 *text* 上。
 *
 * 返回覆盖之后的文本，以及实际换掉的段名（用于日志）。
 */
export const replaceAudioBlocks = (
  text: string,
  base: AudioBlocks
): { text: string; replaced: string[] } => {
  const replaced: string[] = [];
  let next = text;
  const current = readAudioBlocks(text);

  if (base.tagEventList && current?.tagEventList !== base.tagEventList) {
    const after = applyBlock(next, TAG_FIELD, base.tagEventList);
    if (after !== next) {
      replaced.push('tagEventList');
      next = after;
    }
  }
  if (base.bankUnits && current?.bankUnits !== base.bankUnits) {
    const after = applyBlock(next, UNITS_FIELD, base.bankUnits);
    if (after !== next) {
      replaced.push('bankUnits');
      next = after;
    }
  }
  return { text: next, replaced };
};

/** 名字里带「别的皮肤」的音频标记（给日志和自检用） */
export const skinAudioMarkers = (text: string, champion: string): string[] => {
  const name = `${champion.toLowerCase()}skin`;
  const bank = `${champion.toLowerCase()}_skin`;
  const found = new Set<string>();
  const names = text.match(/"[^"\n]*"/g) ?? [];
  for (const quoted of names) {
    const value = quoted.slice(1, -1).toLowerCase();
    if (value.includes('/')) {
      // bank 路径不参与 LTK 的名字检查；路径里带 Skin<n> 是正常的
      continue;
    }
    const isSkinName = new RegExp(`${name}\\d+`).test(value);
    const isSkinBank = new RegExp(`${bank}\\d+_sfx`).test(value);
    if (isSkinName || isSkinBank) {
      found.add(quoted.slice(1, -1));
    }
    if (found.size > 100) {
      break;
    }
  }
  return Array.from(found);
};

// --------------------------------------------------------------------------------------
// bankUnits 里的单个 BankUnit
// --------------------------------------------------------------------------------------

/** `BankUnit { ... }` 在文本里的位置和它现在的内容 */
export interface BankUnitBlock {
  start: number;
  end: number;
  /** `BankUnit` 这一行前面的缩进 */
  indent: string;
  name: string | null;
  /** 名字字符串（引号内）的位置 */
  nameSpan: Span | null;
  paths: string[];
  events: string[];
  /** `events: list[string] = {` 之后到配对的 `}` 之前 */
  eventsInner: Span | null;
  /** `events: list[string] = {` 这一行的缩进 */
  eventsIndent: string;
  voiceOver: boolean;
}

const quotedValues = (text: string, from: number, to: number): string[] =>
  (text.slice(from, to).match(/"([^"\n]*)"/g) ?? []).map((quoted) => quoted.slice(1, -1));

/** 一个 `field: list[string] = { ... }` 的内容范围和值 */
const listSpan = (text: string, field: string): { inner: Span; values: string[] } | null => {
  const matched = new RegExp(`^[ \\t]*${field}: list\\[string\\] = \\{`, 'm').exec(text);
  if (!matched) {
    return null;
  }
  const open = matched.index + matched[0].length - 1;
  const close = braceEnd(text, open);
  if (close < 0) {
    return null;
  }
  return { inner: { start: open + 1, end: close }, values: quotedValues(text, open + 1, close) };
};

/** 读出 bankUnits 段里所有 BankUnit */
export const parseBankUnits = (block: string): BankUnitBlock[] => {
  const units: BankUnitBlock[] = [];
  const pattern = /[ \t]*BankUnit\s*\{/g;
  let matched = pattern.exec(block);
  while (matched) {
    const start = matched.index;
    const open = start + matched[0].length - 1;
    const close = braceEnd(block, open);
    if (close < 0) {
      break;
    }
    const body = block.slice(start, close + 1);
    const nameMatch = /^[ \t]*name: string = "([^"]*)"/m.exec(body);
    const paths = listSpan(body, 'bankPath');
    const events = listSpan(body, 'events');
    const indent = (/^[ \t]*/.exec(body) ?? [''])[0];
    let nameSpan: Span | null = null;
    if (nameMatch) {
      const quoteAt = nameMatch[0].indexOf('"');
      const at = start + nameMatch.index + quoteAt + 1;
      nameSpan = { start: at, end: at + nameMatch[1].length };
    }
    units.push({
      start,
      end: close + 1,
      indent,
      name: nameMatch ? nameMatch[1] : null,
      nameSpan,
      paths: paths ? paths.values : [],
      events: events ? events.values : [],
      eventsInner: events
        ? { start: start + events.inner.start, end: start + events.inner.end }
        : null,
      eventsIndent: `${indent}    `,
      voiceOver: /voiceOver: bool = true/.test(body),
    });
    pattern.lastIndex = close + 1;
    matched = pattern.exec(block);
  }
  return units;
};

const spliceSpan = (text: string, span: Span, replacement: string): string =>
  text.slice(0, span.start) + replacement + text.slice(span.end);

/** 按改动渲染一个 BankUnit 的文本；events 给了就整段换掉 */
export const renderBankUnit = (
  block: string,
  unit: BankUnitBlock,
  edit: { name?: string; events?: string[] }
): string => {
  let text = block.slice(unit.start, unit.end);
  const relative = (span: Span): Span => ({ start: span.start - unit.start, end: span.end - unit.start });

  // 先改后面的（events），再改前面的（name）：前面一改，后面的偏移就变了
  if (edit.events !== undefined && unit.eventsInner) {
    const fieldIndent = unit.eventsIndent;
    const lines = edit.events.map((event) => `\n${fieldIndent}    "${event}"`).join('');
    text = spliceSpan(
      text,
      relative(unit.eventsInner),
      lines ? `${lines}\n${fieldIndent}` : `\n${fieldIndent}`
    );
  }
  if (edit.name !== undefined) {
    if (unit.nameSpan) {
      text = spliceSpan(text, relative(unit.nameSpan), edit.name);
    } else {
      text = text.replace(/(BankUnit\s*\{\n)/, `$1${unit.indent}    name: string = "${edit.name}"\n`);
    }
  }
  return text;
};

/**
 * 重写 bankUnits 段：header 和最后的 `}` 保留，逐个替换 BankUnit，
 * 并可在最后追加现成的 BankUnit 文本（例如 base 皮肤的 VO 单位）。
 */
export const rewriteBankUnits = (
  block: string,
  units: BankUnitBlock[],
  edits: Array<{ name?: string; events?: string[] } | null>,
  extraUnits: string[] = []
): string => {
  const parts: string[] = [];
  let cursor = 0;
  units.forEach((unit, index) => {
    parts.push(block.slice(cursor, unit.start));
    const edit = edits[index];
    if (edit) {
      parts.push(renderBankUnit(block, unit, edit));
    }
    cursor = unit.end;
  });
  for (const text of extraUnits) {
    // 末尾的换行去掉，前面补一个：单位之间各占一行
    const trimmed = text.replace(/\s+$/, '');
    if (trimmed) {
      parts.push(`\n${trimmed}`);
    }
  }
  parts.push(block.slice(cursor));
  return parts.join('');
};
