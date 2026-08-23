/**
 * 英雄联盟资源图片 URL 工具（腾讯 CDN，与项目现有皮肤模块保持一致）
 */
import http from '@/utils/http';

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

/** 英雄方形头像 */
export const getChampionSquareIcon = (alias: string): string =>
  `${GTIMG_CDN}/champion/${alias}_square_0.png`;

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
