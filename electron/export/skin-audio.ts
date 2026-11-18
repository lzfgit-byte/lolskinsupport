/**
 * base 皮肤的音频身份改写（对应 Rose 1.5.9 `injection/baseskin/steps.py` 的
 * audio / banks / bankpaths / eventnames 几步，提交 2c64012d）。
 *
 * 为什么需要：LTK Manager 的 patcher 除了看 mesh，还会看 bin 里的名字 ——
 * `ChampionSkinName`、`SkinAudioProperties.TagEventList`、`BankUnits[].Name`
 * （`<英雄>_Skin<n>_SFX` 这种）以及非 voiceOver 单位列出的事件名
 * （`Play_sfx_<英雄>Skin<n>_...`）。只要命中「别的皮肤」，照样判 skinhack。
 * 规则见 LTK 的 `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs`
 * （`Markers` / `other_skin_names`）。
 *
 * 这个文件先做「把音频身份换回 base 皮肤」这半边：直接取游戏自带 skin0.bin 的
 * `tagEventList` / `bankUnits` 两段，覆盖到生成的 bin 上。这样：
 *   - 名字全部变成 base 皮肤的（`Vayne_Base_SFX` / `Play_sfx_Vayne_...`），
 *     patcher 的名字检查通过；
 *   - 游戏按 base 皮肤的方式加载 base 的 bank（base SFX / base VO），
 *     不会出现「指向不存在的 bank」。
 *
 * 代价：皮肤自带的专属音效/语音会退回 base 皮肤的。Rose 的做法是把皮肤自己的
 * bank 换个路径塞进包里、并在 bank 里加上 base 名字的事件别名，从而保住专属音效
 * （`audio.py` 的 merge 那套 + `META/rose_sounds.json`）。那一步要写 BNK/WPK 和
 * 多语言 WAD，属于后续工作，这里先不做。
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
        return { start: matched.index, end: at + 1 };
      }
    }
  }
  return null;
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
