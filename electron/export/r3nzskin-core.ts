/**
 * Pure helpers for the lolskinsupport -> R3nzSkin bridge (no IO, easy to test).
 *
 * R3nzSkin's own skin list (`SkinDatabase`) is built from the live game memory:
 * the champion's *base* skins ordered by skin id, plus the extra fake entries
 * R3nzSkin appends for Elementalist Lux and DJ Sona. We reproduce that list to
 * translate a lolskinsupport skin into `<alias>.current_combo_skin_index`.
 *
 * The live client is the authoritative source (LCU game-data asset). The bundled
 * Tencent catalogue is only a fallback: it lags behind patches for some
 * champions, which shifts the index.
 */

export const LOL_SKIN_ID_BASE = 1000;

/** R3nzSkin appends these fake entries right after the given skin id. */
const EXTRA_ENTRIES_AFTER: Record<string, { skinId: number; count: number }> = {
  Lux: { skinId: 7, count: 9 }, // Elementalist Air/Dark/Fire/... Lux
  Sona: { skinId: 6, count: 2 }, // DJ Sona 2, DJ Sona 3
};

export interface LolHeroSkin {
  skinId: string;
  name: string;
  isBase: boolean;
  chromas: string;
  chromasBelongId: string;
}

export interface LolHero {
  heroId: string;
  alias: string;
  name: string;
  skins: LolHeroSkin[];
}

/** Skin list read from the live client (LCU champion asset / CommunityDragon). */
export interface ChampionSkinList {
  alias: string;
  /** Base skin ids in ascending order, already normalized to the 1..999 suffix. */
  skinIds: number[];
}

export type R3nzSkinConfig = Record<string, unknown>;

export type SkinListSource = 'lcu' | 'bundled' | 'none';

export interface SkinIndexResolution {
  /** 1-based R3nzSkin combo index, 0 when nothing matched. */
  index: number;
  /** Raw in-game skin id that will actually be applied. */
  skinId: number;
  /** Where the ordered skin list came from. */
  listSource: SkinListSource;
  /** True when a chroma was replaced by its parent skin. */
  fellBackToParent: boolean;
  /** Optional user facing note. */
  note?: string;
}

export const toSkinSuffix = (lolSkinId: string | number): number => {
  const value = Number(lolSkinId);
  if (!Number.isInteger(value) || value < 0) {
    return -1;
  }
  const suffix = value % LOL_SKIN_ID_BASE;
  return suffix >= 0 && suffix < LOL_SKIN_ID_BASE ? suffix : -1;
};

/** Tencent / client skin id (`heroId * 1000 + n`) -> raw in-game skin id (`n`). */
export const gameSkinIdFromLolSkinId = (
  heroId: string | number,
  lolSkinId: string | number
): number => {
  const hero = Number(heroId);
  const skin = Number(lolSkinId);
  if (!Number.isInteger(hero) || !Number.isInteger(skin) || hero <= 0 || skin < 0) {
    return -1;
  }
  if (Math.floor(skin / LOL_SKIN_ID_BASE) !== hero) {
    return -1;
  }
  return skin % LOL_SKIN_ID_BASE;
};

/** Parse one bundled `public/lol-data/heroes/<heroId>.json` payload. */
export const parseLolHeroData = (raw: string): LolHero | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const alias = `${parsed?.hero?.alias ?? ''}`;
    const heroId = `${parsed?.hero?.heroId ?? ''}`;
    const rawSkins = Array.isArray(parsed?.skins) ? parsed.skins : [];
    const skins: LolHeroSkin[] = rawSkins
      .map((skin: any) => ({
        skinId: `${skin?.skinId ?? ''}`,
        name: `${skin?.name ?? ''}`,
        isBase: `${skin?.isBase ?? '0'}` === '1',
        chromas: `${skin?.chromas ?? '0'}`,
        chromasBelongId: `${skin?.chromasBelongId ?? '0'}`,
      }))
      .filter((skin: LolHeroSkin) => !!skin.skinId);

    if (!alias || !skins.length) {
      return null;
    }
    return { heroId, alias, name: `${parsed?.hero?.name ?? alias}`, skins };
  } catch {
    return null;
  }
};

/**
 * Parse the client's champion asset (`/lol-game-data/assets/v1/champions/{id}.json`,
 * same shape as CommunityDragon): `skins[]` already only holds base skins, and
 * chromas are nested inside each skin, so the order is exactly R3nzSkin's list.
 */
export const parseChampionSkinList = (
  raw: string | Record<string, any> | null | undefined
): ChampionSkinList | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const alias = `${parsed?.alias ?? ''}`;
    const rawSkins: any[] = Array.isArray(parsed?.skins) ? parsed.skins : [];
    const skinIds: number[] = Array.from(
      new Set<number>(
        rawSkins.map((skin) => toSkinSuffix(skin?.id)).filter((suffix) => suffix >= 0)
      )
    ).sort((a, b) => a - b);

    if (!alias || !skinIds.length) {
      return null;
    }
    return { alias, skinIds };
  } catch {
    return null;
  }
};

export const findLolSkin = (hero: LolHero | null, lolSkinId: string): LolHeroSkin | undefined =>
  hero?.skins.find((skin) => skin.skinId === `${lolSkinId}`);

/** Sorted, de-duplicated base skin ids from the bundled catalogue. */
export const baseSkinIds = (hero: LolHero): number[] =>
  Array.from(
    new Set(
      hero.skins
        .filter((skin) => skin.chromasBelongId === '0')
        .map((skin) => toSkinSuffix(skin.skinId))
        .filter((suffix) => suffix >= 0)
    )
  ).sort((a, b) => a - b);

/** Reproduce R3nzSkin's 1-based combo index for a base skin id. */
export const computeIndexFromSkinIds = (
  alias: string,
  skinIds: number[],
  targetSkinId: number
): number => {
  const extra = EXTRA_ENTRIES_AFTER[alias];
  let index = 0;
  for (const current of skinIds) {
    index += 1;
    if (current === targetSkinId) {
      return index;
    }
    if (extra && current === extra.skinId) {
      index += extra.count;
    }
  }
  return 0;
};

/**
 * Translate a lolskinsupport skin into R3nzSkin's combo index.
 * @param liveList ordered skin list read from the running client, when available
 */
export const resolveSkinIndex = (
  hero: LolHero,
  lolSkinId: string,
  liveList?: ChampionSkinList | null
): SkinIndexResolution => {
  const requested = findLolSkin(hero, lolSkinId);
  let skinId = gameSkinIdFromLolSkinId(hero.heroId || Number(lolSkinId) / LOL_SKIN_ID_BASE, lolSkinId);
  let note: string | undefined;

  if (requested && requested.chromasBelongId !== '0') {
    const parent = toSkinSuffix(requested.chromasBelongId);
    if (parent >= 0) {
      skinId = parent;
      note = 'R3nzSkin 的皮肤列表不含炫彩，已自动改用该炫彩对应的基础皮肤';
    }
  }

  if (skinId < 0) {
    return { index: 0, skinId: -1, listSource: 'none', fellBackToParent: false };
  }

  const useLive = !!liveList?.skinIds?.length && liveList.alias === hero.alias;
  const listSource: SkinListSource = useLive ? 'lcu' : 'bundled';
  const skinIds = useLive ? liveList!.skinIds : baseSkinIds(hero);

  const index = computeIndexFromSkinIds(hero.alias, skinIds, skinId);
  return {
    index,
    skinId,
    listSource: index > 0 ? listSource : 'none',
    fellBackToParent: !!requested && requested.chromasBelongId !== '0',
    note,
  };
};

/** Merge `<alias>.current_combo_skin_index` into an existing R3nzSkin64 config. */
export const mergeR3nzConfig = (
  config: R3nzSkinConfig | null | undefined,
  alias: string,
  index: number
): R3nzSkinConfig => {
  const next: R3nzSkinConfig = { ...(config ?? {}) };
  if (alias && index > 0) {
    next[`${alias}.current_combo_skin_index`] = index;
  }
  return next;
};

/** Count how many champions already have a saved skin index in the config. */
export const countConfiguredChampions = (config: R3nzSkinConfig | null | undefined): number =>
  Object.keys(config ?? {}).filter((key) => key.endsWith('.current_combo_skin_index')).length;
