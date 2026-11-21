/**
 * 生成后的「LTK skinhack 名字检查」。
 *
 * 对应 LTK 的 `crates/ltk-manager-problems/src/rules/bin_skinhack/mod.rs`：
 * patcher 在进游戏时会读每个 mod 的 `<英雄>.wad.client` 里的
 * `data/characters/<英雄>/skins/skin0.bin`，只要下面任一项命中「别的皮肤」，
 * 就把整个 overlay 关掉（`Integrity scan rejected ... status c0000229`）：
 *
 *   - `ChampionSkinName`；
 *   - `SkinAudioProperties.TagEventList` 里的 tag；
 *   - `SkinAudioProperties.BankUnits[].Name`（`<英雄>_Skin<n>_SFX` 这种）；
 *   - 非 voiceOver 单位列出的事件名 —— 但 base 皮肤自己也列的事件不算（`stock`）。
 *
 * 「命中」的判定是 `names_other_skin()`：名字里出现 `<英雄>skin<n>`（n ≠ 0），
 * 单位名用的是 `<英雄>_skin<n>_sfx`。注意事件名有两种写法
 * （`Play_sfx_<tag>_…` 的 tag 在第三段，状态类 `Play_<tag>_<状态>` 在第二段），
 * 这里都按子串匹配，不依赖位置 —— 和 LTK 一致。
 *
 * 为什么要在生成后跑：Akali skin102 的事件名就属于状态类那种，漏改之后包能生成，
 * 但一进游戏 overlay 就被关掉，用户只看到「没有挂载成功」。检查本身只是字符串扫描
 * （一个皮肤几个毫秒），所以在生成时顺手做掉，结果写到 zip 旁边的 `.check.json`，
 * 注入前读它，不通过就不注入。
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseBankUnits, readAudioBlocks, type AudioBlocks } from './skin-audio';

/** 命中的是哪一类名字 */
export type SkinCheckKind = 'championSkinName' | 'tagEventList' | 'unitName' | 'event';

export interface SkinCheckProblem {
  kind: SkinCheckKind;
  value: string;
}

/**
 * 包内容版本：出包内容变了（旧的包需要重新生成）就 +1。
 *
 *   1（没有这个字段）→ 2：开始随包带皮肤自己的动画图 `animations/skin0.bin`，
 *   并把皮肤 bin 的 `animationGraphData` 指到它（见 `skin-animation.ts`）。
 *   2 → 3：`objectPath` 换成 base 皮肤自己的路径、骨架/网格引用照抄 base bin 的写法
 *   （大小写）、去掉目标不在本包里的 `skinUpgradeData`（见 `skin-rebase.ts`）——
 *   这三处不改，传说皮肤（例如 MissFortune 21_69）进游戏走路/技能都不播动画。
 *   3 → 4：去掉 gear 数据后，把第一档 gear 会显示的 submesh 从 `initialSubmeshToHide`
 *   删掉（`unhideSubmeshes()`），否则模型上少两把枪。
 *   4 → 5：同样为了补 gear，把 gear 的 `mVFXResourceResolver.resourceMap` 补进皮肤的
 *   `Resources`（`applyGearVfxMap()`），否则 W 的枪口特效没有。
 *   5 → 6：炫彩（有 `skinParent`、`skinClassification = 2`）按独立皮肤的身份写
 *   （`normalizeChromaClassification()`）—— 炫彩塞进 base 槽位后技能特效解析不到。
 *   6 → 7：base-slot 外壳（`skin-base-slot.ts`，对照 Rose 的 68003 包）：base 的 bin 只留
 *   身份 + `Resources`、`objectPath` 留在原皮肤命名空间、`linked` 并上 base 的清单、
 *   原皮肤 bin 整份随包并删掉含皮肤名的 `keywordsRequired` 闸门、删挂点不存在的 idle 特效。
 *   6 及以前的包把整套粒子内嵌进 base bin，特效链对不上（Q 火焰歪、E/R 缺特效）。
 *   7 → 8：英雄专属补丁层（`skin-patches/`，`applySkinPatch()`）：游戏数据里根本不存在
 *   那段定义时（Rumble 的 R 燃烧特效）由补丁把数据块插进 base-slot 的 bin。没登记补丁的
 *   英雄走纯数据流程，包内容和 7 一样，只是版本号变了。
 *
 * `checkHasSkins()` / `autoBuildSkin()` 看到旧版本会把包当成「没有」，重新生成一次。
 */
export const SKIN_ARCHIVE_BUILDER = 8;

export interface SkinCheckResult {
  /** 检查通过 */
  ok: boolean;
  /** 被检查的角色（WAD 同名目录） */
  champion: string;
  /** 检查时间（ISO） */
  checkedAt: string;
  problems: SkinCheckProblem[];
  /** 生成这个包的构建版本（`SKIN_ARCHIVE_BUILDER`）；老包没有这个字段 */
  builder?: number;
}

/** base 皮肤的身份：改名用的名字 + 音频段（事件白名单从这里面取） */
export interface SkinBaseIdentity {
  championSkinName?: string;
  audio?: AudioBlocks | null;
}

const quotedValues = (text: string): string[] =>
  (text.match(/"([^"\n]*)"/g) ?? []).map((value) => value.slice(1, -1));

/**
 * `value` 里有没有 `<marker><n><suffix>`（n ≠ 0）。
 *
 * 和 LTK 的 `names_other_skin()` 一样：marker 可以出现在任意位置，数字紧跟其后，
 * 再后面跟着 `suffix`。大小写不敏感。`AatroxSkin07` 命中，`AatroxSkin0` 不命中。
 */
export const namesOtherSkin = (value: string, marker: string, suffix = ''): boolean => {
  const lower = value.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(marker, from);
    if (at < 0) {
      return false;
    }
    const tail = lower.slice(at + marker.length);
    const digits = /^\d+/.exec(tail)?.[0] ?? '';
    if (digits && Number(digits) !== 0 && tail.startsWith(suffix, digits.length)) {
      return true;
    }
    from = at + marker.length;
  }
};

/**
 * 检查一份皮肤 bin 文本里有没有「别的皮肤」的名字。
 *
 * `champion` 用 WAD 同名的角色目录（`Akali.wad.client` -> `akali`），和 LTK 一致。
 * `base` 是游戏里这个角色 base 皮肤的身份；没有它也能查，只是少了事件白名单。
 */
export const checkSkinNames = (options: {
  text: string;
  champion: string;
  base?: SkinBaseIdentity;
}): SkinCheckProblem[] => {
  const champion = options.champion.toLowerCase();
  const nameMarker = `${champion}skin`;
  const unitMarker = `${champion}_skin`;
  const problems: SkinCheckProblem[] = [];
  const seen = new Set<string>();
  const add = (kind: SkinCheckKind, value: string) => {
    const key = `${kind}|${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      problems.push({ kind, value });
    }
  };

  const skinName = /(?:^|\n)\s*championSkinName:\s*string\s*=\s*"([^"]*)"/.exec(
    options.text
  )?.[1];
  if (skinName && namesOtherSkin(skinName, nameMarker)) {
    add('championSkinName', skinName);
  }

  const blocks = readAudioBlocks(options.text);
  if (!blocks) {
    return problems;
  }

  for (const tag of quotedValues(blocks.tagEventList)) {
    if (namesOtherSkin(tag, nameMarker)) {
      add('tagEventList', tag);
    }
  }

  const baseUnits = parseBankUnits(options.base?.audio?.bankUnits ?? '');
  // base 皮肤自己也列的事件不算「别的皮肤」（有的 base 皮肤就是会列别的皮肤的事件）
  const stock = new Set(baseUnits.flatMap((unit) => unit.events));

  for (const unit of parseBankUnits(blocks.bankUnits)) {
    if (unit.name && namesOtherSkin(unit.name, unitMarker, '_sfx')) {
      // LTK 只报单位名，不再看这个单位的事件
      add('unitName', unit.name);
      continue;
    }
    if (unit.voiceOver) {
      continue;
    }
    for (const event of unit.events) {
      if (!stock.has(event) && namesOtherSkin(event, nameMarker)) {
        add('event', event);
      }
    }
  }
  return problems;
};

/** 检查结果写在哪：zip 旁边同名 `.check.json`（皮肤列表只扫 `*.zip`，多这个文件没关系） */
export const skinCheckPath = (zipPath: string): string => `${zipPath}.check.json`;

/** 写检查结果（失败不影响主流程） */
export const writeSkinCheck = (zipPath: string, result: SkinCheckResult): void => {
  try {
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    fs.writeFileSync(skinCheckPath(zipPath), JSON.stringify(result, null, 2), 'utf8');
  } catch {
    // 写不进去就当没检查过：注入前读不到结果就不拦
  }
};

/** 读检查结果；没有（老版本生成的包）或读坏了返回 null */
export const readSkinCheck = (zipPath: string): SkinCheckResult | null => {
  try {
    const raw = JSON.parse(fs.readFileSync(skinCheckPath(zipPath), 'utf8'));
    if (typeof raw?.ok !== 'boolean' || !Array.isArray(raw?.problems)) {
      return null;
    }
    return {
      ok: raw.ok,
      champion: `${raw.champion ?? ''}`,
      checkedAt: `${raw.checkedAt ?? ''}`,
      problems: raw.problems
        .filter((item: any) => item && typeof item.value === 'string')
        .map((item: any) => ({ kind: item.kind, value: item.value })),
      ...(Number.isFinite(raw.builder) ? { builder: Number(raw.builder) } : {}),
    };
  } catch {
    return null;
  }
};

/**
 * 这个包是旧版本构建的（内容格式变了，需要重新生成）。
 *
 * 没有 `.check.json`（不是我们生成的包，比如手动拖进来的）返回 false —— 不去动它。
 */
export const isStaleSkinCheck = (check: SkinCheckResult | null): boolean =>
  !!check && check.builder !== SKIN_ARCHIVE_BUILDER;

/** 注入前用：这个包是不是「检查没通过、不许加载」；没检查过（老包）返回 null 放行 */
export const blockedSkinCheck = (zipPath: string): SkinCheckResult | null => {
  const check = readSkinCheck(zipPath);
  return check && !check.ok ? check : null;
};

/** 把检查结果压成一句给用户看的话 */
export const describeSkinCheck = (
  result: Pick<SkinCheckResult, 'problems'>,
  limit = 3
): string => {
  const names = result.problems.slice(0, limit).map((item) => item.value);
  const more = result.problems.length > limit ? ` 等 ${result.problems.length} 个` : '';
  return names.join('、') + more;
};
