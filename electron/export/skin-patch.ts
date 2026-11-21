/**
 * 英雄专属补丁层（builder 8）。
 *
 * 主流程（`skin-base-slot.ts` 的 base-slot 外壳）对所有英雄一视同仁，能重建出来的东西
 * 全部靠数据推导。但有些皮肤的**特效数据本身**在游戏数据里就不存在 —— 手改包里是把整段
 * 定义搬进来的，靠规则推导不出来。这一层就是给这种英雄留的「可选补丁」：
 *
 * - 没注册补丁的英雄 → 什么都不做，走纯数据流程（现有多数皮肤就是这种）；
 * - 注册了补丁的英雄 → 在 base-slot 外壳改写完之后，把补丁里的数据块插进 bin 的 py 文本。
 *
 * 补丁只做两类插入，不改任何已有字段：
 * 1. `propsInsert`：插进 `SkinCharacterDataProperties` 里（锚在某个字段之后）；
 * 2. `entriesInsert`：插进顶层 `entries` 表末尾（`VfxSystemDefinitionData` 这类独立条目）。
 *
 * 片段文本按「最小缩进对齐目标层级」重新缩进，所以补丁文件里可以从任意缩进写起；
 * 插入前会检查花括号配平，配不平直接抛错（宁可构建失败，也不要出一个半残的包）。
 */
import type { SlotEdit } from './skin-base-slot';

/** 插进 `SkinCharacterDataProperties` 的一块文本 */
export interface SkinPatchPropsInsert {
  /** 锚字段名（`skinParent` 这种，不含缩进）；不填 = 插到该对象末尾 */
  after?: string;
  /** 日志里显示的名字 */
  label?: string;
  /** 要插入的 py 文本 */
  text: string;
}

/** 插进顶层 `entries` 表的一块文本（自带 `0x… = Class { … }` 头） */
export interface SkinPatchEntryInsert {
  label?: string;
  text: string;
}

/** 改写 `Resources` 里的 `resourceMap`（key → 资源 hash） */
export interface SkinPatchResourceMap {
  label?: string;
  /** 已经有的 key 覆盖值，没有的追加 */
  set: Record<string, string>;
  /**
   * 要删掉的 key。用来对齐「手改包里有、我们这边多出来」的映射：
   * 同一个粒子被两套 key 同时解析到，游戏会把粒子渲染两遍（Rumble 的 Q 两个方向）。
   */
  remove?: string[];
}

export interface SkinPatch {
  /** 角色目录名（小写，和 `data/characters/<x>/` 一致） */
  champion: string;
  /**
   * 只对这些皮肤序号生效（不填 = 该英雄所有皮肤）。补丁里的数据经常写死了原皮肤的
   * 粒子路径（`Skins/Skin3/Particles/…`），没验证过的皮肤别跟着套。
   */
  skins?: number[];
  /** 为什么需要这份补丁（出处 / 游戏里的现象），只用于日志和文档 */
  note?: string;
  propsInsert?: SkinPatchPropsInsert[];
  entriesInsert?: SkinPatchEntryInsert[];
  resourceMap?: SkinPatchResourceMap;
}

const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * 从 `start` 行开始按花括号配对数到块结束（返回结束行下标，含）。
 * 和 `skin-base-slot.ts` 里同名函数一致：ritobin 文本的字符串里没有花括号。
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

/** 片段里第一个非空行（用来判断「这份补丁是不是已经插过了」） */
const markerOf = (fragment: string[]): string =>
  fragment.find((line) => line.trim() !== '')?.trim() ?? '';

/** 把片段整体平移到 `level` 缩进：片段里最小缩进对齐目标层级（首尾空行去掉） */
const reindent = (fragment: string[], level: number): string[] => {
  const body = [...fragment];
  while (body.length > 0 && body[0].trim() === '') body.shift();
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
  const indents = body.filter((line) => line.trim() !== '').map(indentOf);
  if (indents.length === 0) return [];
  const delta = level - Math.min(...indents);
  return body.map((line) =>
    line.trim() === '' ? '' : `${' '.repeat(Math.max(0, indentOf(line) + delta))}${line.trimStart()}`
  );
};

/** 校验片段：花括号配平、无控制字符以外的坑 */
const checkFragment = (label: string, fragment: string[]): void => {
  let depth = 0;
  for (const line of fragment) {
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth < 0) throw new Error(`[patch] ${label}: 花括号不配平`);
    }
  }
  if (depth !== 0) throw new Error(`[patch] ${label}: 花括号不配平（余 ${depth} 层）`);
};

/**
 * 把补丁插进 base-slot 的 py 文本。
 *
 * `text` 要求是已经过 base-slot 外壳处理的文本（只剩身份对象 + Resources）；
 * 找不到身份对象 / entries 表、或片段已经插过时，对应那一步跳过并记进日志。
 */
export const applySkinPatch = (text: string, patch: SkinPatch | null): SlotEdit => {
  if (!patch) return { text, removed: [], added: [] };
  const added: string[] = [];
  let current = text;

  for (const insert of patch.propsInsert ?? []) {
    const label = insert.label ?? insert.after ?? patch.champion;
    const fragment = reindent(insert.text.split(/\r?\n/), 8);
    checkFragment(label, fragment);
    const marker = markerOf(fragment);
    if (marker && current.includes(marker)) continue;

    const lines = current.split('\n');
    const propsStart = lines.findIndex((line) =>
      /^ {4}(?:"[^"]*"|0x[0-9a-fA-F]+) = SkinCharacterDataProperties \{/.test(line)
    );
    if (propsStart < 0) continue;
    const propsEnd = blockEnd(lines, propsStart);
    let at = propsEnd;
    if (insert.after) {
      const anchor = lines.findIndex(
        (line, index) =>
          index > propsStart &&
          index < propsEnd &&
          new RegExp(`^ {8}${insert.after}: `).test(line)
      );
      if (anchor < 0) continue;
      at = blockEnd(lines, anchor) + 1;
    }
    current = [...lines.slice(0, at), ...fragment, ...lines.slice(at)].join('\n');
    added.push(label);
  }

  for (const insert of patch.entriesInsert ?? []) {
    const label = insert.label ?? patch.champion;
    const fragment = reindent(insert.text.split(/\r?\n/), 4);
    checkFragment(label, fragment);
    const marker = markerOf(fragment);
    if (marker && current.includes(marker)) continue;

    const lines = current.split('\n');
    const start = lines.findIndex((line) => /^entries: map\[hash, embed\] = \{/.test(line));
    if (start < 0) continue;
    const end = blockEnd(lines, start);
    current = [...lines.slice(0, end), ...fragment, ...lines.slice(end)].join('\n');
    added.push(label);
  }

  const resourceMap = patch.resourceMap;
  const removeKeys = (resourceMap?.remove ?? []).map((key) => key.trim().toLowerCase());
  if (resourceMap && (Object.keys(resourceMap.set).length > 0 || removeKeys.length > 0)) {
    const label = resourceMap.label ?? `${patch.champion} resourceMap`;
    const lines = current.split('\n');
    const start = lines.findIndex((line) => /^\s{8}resourceMap: map\[hash, link\] = \{/.test(line));
    if (start >= 0) {
      const end = blockEnd(lines, start);
      const pending = new Map(
        Object.entries(resourceMap.set).map(([key, value]) => [key.trim(), value.trim()])
      );
      const removedKeys: string[] = [];
      const body: string[] = [];
      for (const line of lines.slice(start + 1, end)) {
        const match = /^(\s+)(0x[0-9a-fA-F]+) = (0x[0-9a-fA-F]+)$/.exec(line);
        if (match && removeKeys.includes(match[2].toLowerCase())) {
          removedKeys.push(match[2]);
          continue;
        }
        if (!match) {
          body.push(line);
          continue;
        }
        const next = pending.get(match[2].toLowerCase()) ?? pending.get(match[2]);
        if (next === undefined) {
          body.push(line);
          continue;
        }
        pending.delete(match[2]);
        body.push(`${match[1]}${match[2]} = ${next}`);
      }
      const entryIndent = ' '.repeat(indentOf(lines[start]) + 4);
      for (const [key, value] of pending) {
        body.push(`${entryIndent}${key} = ${value}`);
      }
      current = [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join('\n');
      if (body.join('\n') !== lines.slice(start + 1, end).join('\n')) {
        const parts = [`改 ${Object.keys(resourceMap.set).length} 条`];
        if (removedKeys.length > 0) parts.push(`删 ${removedKeys.length} 条（${removedKeys.join(', ')}）`);
        added.push(`${label}（${parts.join('、')}）`);
      }
    }
  }

  return { text: current, removed: [], added };
};
