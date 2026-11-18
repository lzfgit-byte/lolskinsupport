/**
 * 保住皮肤专属音效：在 bank 里补 base 名字的别名 Event，并改写 bin 的音频身份。
 * 对应 Rose 1.5.9 的 `injection/baseskin/audio.py`（`merge_skin_audio_tags` /
 * `rebase_bank_units` / `unlist_skin_event_names`，提交 2c64012d）。
 *
 * 原理（Rose 的注释写得很清楚）：
 *   皮肤的 `tagEventList` 是优先级链，比如 `{"Vayne", "VayneSkin11"}`。游戏要放
 *   `Play_sfx_Vayne_VayneTumble_OnCast` 时，最后一个有这个名字的 tag 赢，所以
 *   skin 11 实际放的是 `Play_sfx_VayneSkin11_VayneTumble_OnCast`。当它作为 base
 *   皮肤运行时链上只剩 base tag，游戏去找 `Play_sfx_Vayne_...` —— 皮肤的 bank 里
 *   没有这个名字，音效就没了。
 *
 * 做法：
 *   1. 皮肤的 bank 留在原路径（不搬家、不复制整个音频 bank，包只多十几 KB），
 *      只改里面的 Event：为每个「通过别的 tag 才够得到」的事件补一个 base 名字的
 *      别名 Event，指向同一批 Action；
 *   2. base 皮肤自己的事件 bank 里同 id 的 Event 删掉（两个加载中的 bank 定义同一个
 *      id，客户端只会留一个，皮肤的音效可能输给 base 的），改过的随包一起走；
 *   3. bin 里：单位名 `<英雄>_Skin<n>_SFX` → `<英雄>_Base_SFX`，事件列表换成别名
 *      （Skin<n> 的老名字列出来就是给 patcher 抓的），`tagEventList` 换成 base 的；
 *   4. 语音（voiceOver）单位不动：本地化 bank 每个语言一份、mod 装不全，换成游戏
 *      base 皮肤的 VO 单位，语音走 base 的（同一个人配音，差别很小）。
 *
 * 事件 bank 里原来的 Skin<n> 事件保留（动画/VFX 的 bin 会按全名 post 它们），
 * 只是不再列在单位里。
 */

import { Bank, wwiseHash } from './bnk';
import {
  parseBankUnits,
  readAudioBlocks,
  rewriteBankUnits,
  type AudioBlocks,
} from './skin-audio';

/** 一个要写进打包目录的文件 */
export interface BankFilePlan {
  /** 写进打包目录的相对路径（小写，wad-make 按小写路径算哈希） */
  path: string;
  /** bin 里原来的引用路径（保留大小写） */
  reference: string;
  data: Buffer;
  /** 这个 bank 里补了几个别名 */
  aliases: number;
}

export interface BankAliasPlan {
  /** 用来替换 bin 里两段音频的文本 */
  blocks: AudioBlocks;
  files: BankFilePlan[];
  /** 单位改名（`Vayne_Skin11_SFX` -> `Vayne_Base_SFX`） */
  renamedUnits: Array<{ from: string; to: string }>;
  /** 补进 bank 的别名事件数 */
  aliasedEvents: number;
  /** 列出了但 bank 里找不到的事件数（这些补不了别名，列出来会被删掉） */
  missingEvents: number;
  /** 被换成 base 皮肤语音的单位 */
  voiceUnits: string[];
  /** 打过补丁的 base 皮肤事件 bank */
  patchedBaseBanks: string[];
  notes: string[];
}

export interface BankAliasOptions {
  /** 皮肤 bin 的 ritobin 文本 */
  pyText: string;
  character: string;
  /** 游戏 base 皮肤的音频段（skin0.bin 里那两段） */
  baseAudio: AudioBlocks;
  /** 按 WAD 路径读一个 bank，读不到返回 null */
  readBank: (bankPath: string) => Promise<Buffer | null>;
  log?: (message: string) => void;
}

const lowerName = (value: string): string => value.toLowerCase();
const sameName = (left: string, right: string): boolean => lowerName(left) === lowerName(right);

/** Skin01 / skin12：Skin + 纯数字 */
const isSkinSegment = (segment: string): boolean =>
  segment.length > 4 && lowerName(segment.slice(0, 4)) === 'skin' && /^\d+$/.test(segment.slice(4));

/** Aatrox_Skin01_SFX -> Aatrox_Base_SFX；没有 Skin<n> 段就是 null */
export const baseUnitName = (name: string): string | null => {
  const segments = name.split('_');
  if (!segments.some(isSkinSegment)) {
    return null;
  }
  return segments.map((segment) => (isSkinSegment(segment) ? 'Base' : segment)).join('_');
};

/** 事件名里有没有 Skin<n> 段（TalonSkin12 / 单独的 Skin12） */
export const hasSkinTag = (name: string): boolean =>
  name.split('_').some((segment) => {
    const lower = lowerName(segment);
    const at = lower.lastIndexOf('skin');
    if (at < 0) {
      return false;
    }
    const digits = lower.slice(at + 4);
    const head = lower.slice(0, at);
    return /^\d+$/.test(digits) && (head === '' || /^[a-z]+$/.test(head));
  });

/** tag 在事件名里的起点：`<Action>_<category>_` 之后 */
export const tagStart = (name: string): number | null => {
  const first = name.indexOf('_');
  if (first < 0) {
    return null;
  }
  const second = name.indexOf('_', first + 1);
  if (second < 0) {
    return null;
  }
  return second + 1 < name.length ? second + 1 : null;
};

/** 路径里有没有语言目录（.../VO/en_US/...）：本地化 bank 每个语言一份 */
export const isLocalizedPath = (path: string): boolean =>
  path.split('/').some((segment) => /^[A-Za-z]{2}_[A-Za-z]{2}$/.test(segment));

/** 把事件名里的 tag 换成另一个 tag；tag 对不上就是 null */
export const renameTag = (name: string, from: string, to: string): string | null => {
  const at = tagStart(name);
  if (at === null) {
    return null;
  }
  const after = name.slice(at);
  if (!sameName(after.slice(0, from.length), from) || after[from.length] !== '_') {
    return null;
  }
  return `${name.slice(0, at)}${to}${after.slice(from.length)}`;
};

const quoted = (text: string): string[] =>
  (text.match(/"([^"\n]*)"/g) ?? []).map((value) => value.slice(1, -1));

/**
 * 这一份皮肤要读的 bank 路径：皮肤自己的事件 bank，加上 base 皮肤的事件 bank
 * （同 id 的事件要从它里面删掉）。语音 bank 不用读（语音走 base 的）。
 */
export const collectBankPaths = (pyText: string, baseAudio: AudioBlocks): string[] => {
  const blocks = readAudioBlocks(pyText);
  if (!blocks) {
    return [];
  }
  const paths = new Set<string>();
  const add = (unit: { voiceOver: boolean; paths: string[] }) => {
    if (unit.voiceOver) {
      return;
    }
    for (const path of unit.paths) {
      if (/_events\.bnk$/i.test(path) && !isLocalizedPath(path)) {
        paths.add(path);
      }
    }
  };
  for (const unit of parseBankUnits(blocks.bankUnits)) {
    add(unit);
  }
  for (const unit of parseBankUnits(baseAudio.bankUnits)) {
    add(unit);
  }
  return Array.from(paths);
};

interface LoadedBank {
  reference: string;
  bank: Bank;
  modified: boolean;
  aliases: number;
}

/**
 * 为一份皮肤 bin 规划 bank 别名和音频段改写。
 *
 * 返回 null 表示这份 bin 没有能用的 bank 单位，调用方应退回「整段换成 base 语音」。
 */
export const planBankAliases = async (options: BankAliasOptions): Promise<BankAliasPlan | null> => {
  const log = options.log ?? (() => {});
  const blocks = readAudioBlocks(options.pyText);
  if (!blocks) {
    return null;
  }
  const units = parseBankUnits(blocks.bankUnits);
  if (units.length === 0) {
    return null;
  }
  const baseUnits = parseBankUnits(options.baseAudio.bankUnits);
  const baseVo = baseUnits.filter((unit) => unit.voiceOver);
  if (baseVo.length === 0) {
    log(`[base-skin] ${options.character}: base 皮肤没有 voiceOver 单位，音频退回整段替换`);
    return null;
  }

  const tags = quoted(blocks.tagEventList);
  const baseTags = quoted(options.baseAudio.tagEventList);
  const baseTag = baseTags.slice().reverse().find((tag) => tag) ?? null;
  if (!baseTag) {
    return null;
  }
  const droppedTags = tags.filter((tag) => tag && !baseTags.some((base) => sameName(base, tag)));
  if (droppedTags.length === 0) {
    log(`[base-skin] ${options.character}: bin 里没有要合并的音频 tag，音频退回整段替换`);
    return null;
  }
  if (units.every((unit) => unit.voiceOver)) {
    log(`[base-skin] ${options.character}: bin 里只有语音单位，音频退回整段替换`);
    return null;
  }

  const plan: BankAliasPlan = {
    blocks: { tagEventList: options.baseAudio.tagEventList, bankUnits: blocks.bankUnits },
    files: [],
    renamedUnits: [],
    aliasedEvents: 0,
    missingEvents: 0,
    voiceUnits: units.filter((unit) => unit.voiceOver).map((unit) => unit.name ?? ''),
    patchedBaseBanks: [],
    notes: [],
  };

  const loaded = new Map<string, LoadedBank>();
  const load = async (path: string): Promise<LoadedBank | null> => {
    const key = path.toLowerCase();
    const found = loaded.get(key);
    if (found) {
      return found;
    }
    const data = await options.readBank(path);
    if (!data) {
      return null;
    }
    try {
      const entry: LoadedBank = {
        reference: path,
        bank: Bank.parse(data),
        modified: false,
        aliases: 0,
      };
      loaded.set(key, entry);
      return entry;
    } catch (error) {
      log(`[base-skin] ${options.character}: ${path} 不是能解析的 bank（${(error as Error).message}）`);
      return null;
    }
  };

  /** 在单位引用的一堆 bank 里找事件，返回它所在 bank 和 Action 列表 */
  const findEvent = async (paths: string[], eventId: number, prefer: string) => {
    const ordered = [prefer, ...paths.filter((path) => !sameName(path, prefer))];
    for (const path of ordered) {
      const entry = await load(path);
      if (entry?.bank.hasEvent(eventId)) {
        const actions = entry.bank.eventActions(eventId);
        if (actions) {
          return { entry, actions };
        }
      }
    }
    return null;
  };

  const aliasIds = new Map<number, string>();
  const edits = new Map<number, { name?: string; events?: string[] } | null>();

  for (let index = 0; index < units.length; index++) {
    const unit = units[index];
    if (unit.voiceOver) {
      edits.set(index, null);
      continue;
    }
    const renamed = unit.name ? baseUnitName(unit.name) : null;
    if (renamed && renamed !== unit.name) {
      plan.renamedUnits.push({ from: unit.name, to: renamed });
    }
    const bankPaths = unit.paths.filter((path) => !isLocalizedPath(path));
    const eventsBank = bankPaths.find((path) => /_events\.bnk$/i.test(path)) ?? null;
    const target = eventsBank ? await load(eventsBank) : null;
    if (!eventsBank || !target) {
      plan.notes.push(`${unit.name ?? '(无名单位)'} 的事件 bank 读不到，这个单位保持原样`);
      edits.set(index, renamed && renamed !== unit.name ? { name: renamed } : {});
      continue;
    }

    const listed: string[] = [];
    for (const event of unit.events) {
      const at = tagStart(event);
      const tag = at === null ? '' : event.slice(at).split('_')[0];
      const fromDropped = droppedTags.some((dropped) => sameName(dropped, tag));
      if (!fromDropped) {
        listed.push(event);
        continue;
      }
      const alias = renameTag(event, tag, baseTag);
      if (!alias) {
        plan.missingEvents++;
        plan.notes.push(`${event} 认不出 tag，补不了别名`);
        continue;
      }
      const source = await findEvent(bankPaths, wwiseHash(event), eventsBank);
      if (!source) {
        plan.missingEvents++;
        plan.notes.push(`${event} 在 bank 里找不到，补不了别名`);
        continue;
      }
      const aliasId = wwiseHash(alias);
      if (target.bank.hasEvent(aliasId)) {
        if (target.bank.setEventActions(aliasId, source.actions) > 0) {
          target.modified = true;
        }
      } else {
        target.bank.addEvent(aliasId, source.actions);
        target.modified = true;
        target.aliases++;
        plan.aliasedEvents++;
      }
      aliasIds.set(aliasId, alias);
      listed.push(alias);
    }

    edits.set(index, {
      ...(renamed && renamed !== unit.name ? { name: renamed } : {}),
      events: Array.from(new Set(listed)),
    });
  }

  // base 皮肤自己的事件 bank 里，同 id 的 Event 要让位
  const baseSfxBanks = baseUnits
    .filter((unit) => !unit.voiceOver)
    .flatMap((unit) => unit.paths)
    .filter((path) => /_events\.bnk$/i.test(path) && !isLocalizedPath(path));
  for (const path of baseSfxBanks) {
    const entry = await load(path);
    if (!entry) {
      continue;
    }
    for (const aliasId of Array.from(aliasIds.keys())) {
      if (entry.bank.removeEvent(aliasId) > 0) {
        entry.modified = true;
        if (!plan.patchedBaseBanks.some((known) => sameName(known, path))) {
          plan.patchedBaseBanks.push(path);
        }
      }
    }
  }

  for (const entry of Array.from(loaded.values())) {
    if (!entry.modified) {
      continue;
    }
    plan.files.push({
      path: entry.reference.toLowerCase(),
      reference: entry.reference,
      data: entry.bank.write(),
      aliases: entry.aliases,
    });
  }

  const extraUnits = baseVo
    .map((unit) => options.baseAudio.bankUnits.slice(unit.start, unit.end).replace(/\s+$/, ''))
    .filter(Boolean);
  plan.blocks = {
    tagEventList: options.baseAudio.tagEventList,
    bankUnits: rewriteBankUnits(
      blocks.bankUnits,
      units,
      units.map((unit, index) => edits.get(index) ?? null),
      extraUnits
    ),
  };
  return plan;
};
