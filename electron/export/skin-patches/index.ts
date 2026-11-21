/**
 * 英雄专属补丁注册表（builder 8）。
 *
 * 加一个英雄就是在这里加一个模块；没有登记的英雄自动走纯数据流程，不需要任何分支判断。
 * 模块里的东西只放**数据**（要插入的 py 片段），规则仍然只在 `skin-patch.ts` 里。
 */
import type { SkinPatch } from '../skin-patch';
import { rumblePatch } from './rumble';

export { applySkinPatch } from '../skin-patch';
export type {
  SkinPatch,
  SkinPatchEntryInsert,
  SkinPatchPropsInsert,
  SkinPatchResourceMap,
} from '../skin-patch';

export const SKIN_PATCHES: readonly SkinPatch[] = [rumblePatch];

const byChampion = new Map(SKIN_PATCHES.map((patch) => [patch.champion.toLowerCase(), patch]));

/** 按角色目录名找补丁（大小写不敏感）；没有就返回 null = 纯数据流程 */
export const findSkinPatch = (champion: string, skinId?: number): SkinPatch | null => {
  const patch = byChampion.get(champion.toLowerCase());
  if (!patch) return null;
  if (patch.skins && skinId !== undefined && !patch.skins.includes(skinId)) return null;
  return patch;
};
