/**
 * 英雄联盟资源图片 URL 工具（腾讯 CDN，与项目现有皮肤模块保持一致）
 */
import http from '@/utils/http';
import { mhGetLcuImage, mhGetLcuJson } from './ipc';

/** 空物品槽位 ID（LCU 用 0 表示空物品） */
export const EMPTY_ITEM_ID = 0;

/** 召唤师技能 ID → 资源名（腾讯 CDN spell 目录下的文件名前缀） */
const SPELL_ASSET_NAMES: Record<number, string> = {
  1: 'SummonerBoost', // 净化
  3: 'SummonerExhaust', // 虚弱
  4: 'SummonerFlash', // 闪现
  6: 'SummonerHaste', // 幽灵疾步
  7: 'SummonerHeal', // 治疗术
  11: 'SummonerSmite', // 惩戒
  12: 'SummonerTeleport', // 传送
  13: 'SummonerMana', // 清晰术
  14: 'SummonerDot', // 引燃
  21: 'SummonerBarrier', // 屏障
  30: 'SummonerPoroThrow', // 魄罗投掷
  31: 'SummonerPoroRecall', // 魄罗冲刺
  32: 'SummonerSnowball', // 雪球
  39: 'SummonerSnowURF', // 随缘雪球
  54: 'SummonerTest'
};

export interface ChampionMeta {
  /** 英雄英文名（用于图片 URL） */
  alias: string;
  /** 英雄中文名 */
  name: string;
  /** 英雄 id（字符串） */
  heroId: string;
}

const GTIMG_CDN = 'https://game.gtimg.cn/images/lol/act/img';

/** 英雄方形头像（腾讯 CDN，注意是 {alias}.png 而非 _square_0.png） */
export const getChampionSquareIcon = (alias: string): string =>
  `${GTIMG_CDN}/champion/${alias}.png`;

/** 物品图标；空物品槽返回空串 */
export const getItemIcon = (itemId: number): string => {
  if (!itemId || itemId === EMPTY_ITEM_ID) {
    return '';
  }
  return `${GTIMG_CDN}/item/${itemId}.png`;
};

/** 召唤师头像 */
export const getProfileIcon = (profileIconId: number): string =>
  `${GTIMG_CDN}/profileicon/${profileIconId}.png`;

const profileIconCache = new Map<number, string>();

/**
 * 获取召唤师头像图片地址（异步）。
 * 腾讯 CDN 头像覆盖不全，优先通过 LCU 客户端资源取（base64 data URL），
 * 失败时回退到腾讯 CDN URL；结果会缓存。
 */
export async function getProfileIconSrc(iconId: number): Promise<string> {
  const gtimg = getProfileIcon(iconId);
  if (!iconId) {
    return '';
  }
  const cached = profileIconCache.get(iconId);
  if (cached) {
    return cached;
  }
  const viaLcu = await mhGetLcuImage(`profile-icons/${iconId}.jpg`);
  const src = viaLcu || gtimg;
  profileIconCache.set(iconId, src);
  return src;
}

/** 海克斯强化（KIWI）数据 */
export interface KiwiAugment {
  augmentID: number;
  /** 中文名 */
  nameCn: string;
  /** 品质：kPrismatic / kGold / kSilver / kBronze */
  level: string;
  /** 图标完整 URL */
  icon: string;
  /** 中文描述 */
  desc: string;
}

let kiwiAugmentMap: Map<number, KiwiAugment> | null = null;

/**
 * 加载海克斯强化数据（来自腾讯 CDN kiwi_augments.json），结果会缓存
 */
export async function loadKiwiAugments(): Promise<Map<number, KiwiAugment>> {
  if (kiwiAugmentMap) {
    return kiwiAugmentMap;
  }
  try {
    const res: any = await http.axios.get(
      'https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json'
    );
    const map = new Map<number, KiwiAugment>();
    (Array.isArray(res) ? res : []).forEach((a: any) => {
      if (a && a.augmentID) {
        map.set(Number(a.augmentID), {
          augmentID: Number(a.augmentID),
          nameCn: a.name_cn || a.name_en || '',
          level: a.level || '',
          icon: a.small_Icon || '',
          desc: a.tooltip || a.desc || ''
        });
      }
    });
    kiwiAugmentMap = map;
    return map;
  } catch {
    kiwiAugmentMap = new Map();
    return kiwiAugmentMap;
  }
}

/** 获取海克斯强化信息；未知时返回 undefined */
export const getKiwiAugment = (
  id: number,
  map?: Map<number, KiwiAugment>
): KiwiAugment | undefined => {
  return map?.get(id);
};

/** 装备信息（来自 LCU items.json） */
export interface ItemInfo {
  id: number;
  name: string;
  plaintext: string;
  description: string;
  goldTotal: number;
  goldBase: number;
  /** 合成所需部件 id */
  from: number[];
  /** 合成去向 id */
  into: number[];
}

let itemMap: Map<number, ItemInfo> | null = null;

/**
 * 加载装备 id → 信息映射（来自 LCU items.json），结果会缓存
 */
export async function loadItemMap(): Promise<Map<number, ItemInfo>> {
  if (itemMap) {
    return itemMap;
  }
  try {
    const res: any = await mhGetLcuJson('items.json');
    const map = new Map<number, ItemInfo>();
    (Array.isArray(res) ? res : []).forEach((item: any) => {
      const id = Number(item.id);
      if (Number.isFinite(id) && item.name) {
        map.set(id, {
          id,
          name: item.name,
          plaintext: item.plaintext || '',
          description: item.description || '',
          goldTotal: Number(item.gold?.total ?? 0),
          goldBase: Number(item.gold?.base ?? 0),
          from: Array.isArray(item.from) ? item.from.map(Number) : [],
          into: Array.isArray(item.into) ? item.into.map(Number) : []
        });
      }
    });
    itemMap = map;
    return map;
  } catch {
    itemMap = new Map();
    return itemMap;
  }
}

/** 获取装备信息；未知时返回 undefined */
export const getItemInfo = (itemId: number, map?: Map<number, ItemInfo>): ItemInfo | undefined => {
  return map?.get(itemId);
};

/** 获取装备名；未知时返回空串 */
export const getItemName = (itemId: number, map?: Map<number, ItemInfo>): string => {
  return map?.get(itemId)?.name ?? '';
};

/** 去除富文本标签的纯文本描述 */
export const stripItemHtml = (html: string): string => {
  if (!html) {
    return '';
  }
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

let mapNameMap: Map<number, string> | null = null;

/**
 * 加载地图 id → 名称映射（来自 LCU maps.json，客户端本地化），结果会缓存
 */
export async function loadMapNames(): Promise<Map<number, string>> {
  if (mapNameMap) {
    return mapNameMap;
  }
  try {
    const res: any = await mhGetLcuJson('maps.json');
    const map = new Map<number, string>();
    (Array.isArray(res) ? res : []).forEach((m: any) => {
      const id = Number(m.mapId);
      const name = m.mapName || m.name || '';
      if (Number.isFinite(id) && name) {
        map.set(id, name);
      }
    });
    mapNameMap = map;
    return map;
  } catch {
    mapNameMap = new Map();
    return mapNameMap;
  }
}

/** 获取地图名；未知时返回空串 */
export const getMapName = (mapId: number, map?: Map<number, string>): string => {
  return map?.get(mapId) ?? '';
};

/** 召唤师技能图标；未知技能返回空串 */
export const getSpellIcon = (spellId: number): string => {
  const assetName = SPELL_ASSET_NAMES[spellId];
  if (!assetName) {
    return '';
  }
  return `${GTIMG_CDN}/spell/${assetName}.png`;
};

let championMap: Map<number, ChampionMeta> | null = null;

/**
 * 加载英雄 id → 元信息映射（来自腾讯 CDN hero_list.js）
 * 结果会被缓存；与项目主页面加载英雄列表的方式一致
 */
export const loadChampionMap = async (): Promise<Map<number, ChampionMeta>> => {
  if (championMap) {
    return championMap;
  }

  try {
    const res: any = await http.axios.get(
      'https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js'
    );
    const map = new Map<number, ChampionMeta>();
    (res?.hero || []).forEach((item: any) => {
      const heroId = Number(item.heroId);
      if (Number.isFinite(heroId)) {
        map.set(heroId, {
          alias: item.alias,
          name: item.name,
          heroId: item.heroId
        });
      }
    });
    championMap = map;
    return map;
  } catch {
    championMap = new Map();
    return championMap;
  }
};

/** 获取英雄中文名；未知时返回空串 */
export const getChampionName = (championId: number, map?: Map<number, ChampionMeta>): string => {
  return map?.get(championId)?.name ?? '';
};

/** 获取英雄英文名；未知时返回空串 */
export const getChampionAlias = (championId: number, map?: Map<number, ChampionMeta>): string => {
  return map?.get(championId)?.alias ?? '';
};
