<template>
  <div class="mh-item-wrap">
    <div class="mh-row">
      <!-- 左侧三行内容 -->
      <div class="mh-main">
        <!-- 主卡片（点击展开） -->
        <div
          class="mh-item"
          :class="[resultClass, { 'is-expanded': expanded }]"
          @click="toggleExpand"
        >
      <!-- 英雄头像 -->
      <div class="mh-champion">
        <img
          class="champion-icon"
          :src="championIconSrc || championIcon"
          :alt="championName"
          loading="lazy"
        />
      </div>

      <!-- 装备 -->
      <div class="mh-items">
        <a-tooltip v-for="(itemId, i) in participantItems" :key="i">
          <template #title>
            <div class="item-tooltip">
              <div class="item-tooltip-name">{{ itemName(itemId) }}</div>
              <div v-if="itemPrice(itemId)" class="item-tooltip-price">
                {{ itemPrice(itemId) }}
              </div>
              <div v-if="itemFromNames(itemId).length" class="item-tooltip-from">
                {{ itemFromNames(itemId).join(' + ') }}
              </div>
              <div v-if="itemStatsText(itemId)" class="item-tooltip-stats">
                {{ itemStatsText(itemId) }}
              </div>
              <div class="item-tooltip-desc" v-html="itemDescHtml(itemId)" />
            </div>
          </template>
          <img
            v-if="itemId"
            class="item-icon"
            :src="getItemIcon(itemId)"
            :alt="itemName(itemId)"
            loading="lazy"
          />
          <span v-else class="item-slot" />
        </a-tooltip>
      </div>

      <!-- 海克斯强化（列表数据即含，无需详情） -->
      <div v-if="augments.length" class="mh-augments">
        <a-tooltip v-for="id in augments" :key="id">
          <template #title>
            <div class="augment-tooltip">
              <div class="augment-tooltip-name">
                {{ augmentName(id) }}
                <span v-if="formatRarity(id)" class="augment-rarity">
                  {{ formatRarity(id) }}
                </span>
              </div>
              <div class="augment-tooltip-desc">{{ getAugmentDesc(id) }}</div>
            </div>
          </template>
          <img
            class="augment-icon"
            :class="augmentRarityClass(id)"
            :src="getAugmentIcon(id)"
            :alt="augmentName(id)"
            loading="lazy"
          />
        </a-tooltip>
      </div>

      <!-- KDA -->
      <div class="mh-kda">
        <div class="kda-main">
          {{ participant?.kills ?? '-' }} / {{ participant?.deaths ?? '-' }} /
          {{ participant?.assists ?? '-' }}
        </div>
        <div class="kda-sub">{{ kdaRatioText }}</div>
      </div>

      <!-- 伤害 -->
      <div class="mh-damage">
        <div class="dmg-share">
          {{
            summary
              ? shareText(summary.summary.championDamagePercentageOfTeam)
              : '—'
          }}
        </div>
        <div class="dmg-value">{{ damageText }}</div>
      </div>

      <!-- 操作 -->
      <div class="mh-actions">
        <span class="expand-arrow" :class="{ open: expanded }">▾</span>
      </div>
      </div>

      <!-- 评级徽章（第二行） -->
      <div v-if="badges.length" class="mh-badges" :class="resultClass">
        <span
          v-for="(tag, i) in badges"
          :key="i"
          class="badge"
          :class="`badge-${tag.color}`"
          :title="tag.content"
        >
          {{ tag.label }}
        </span>
      </div>

      <!-- 底部信息行 -->
      <div class="mh-meta" :class="resultClass">{{ metaText }}</div>
      </div>

      <!-- 右侧六边形统计（横跨三行） -->
      <div class="mh-side">
        <HexagonStats
          :participant="participant"
          :team="participants"
          :ready="Boolean(detail)"
        />
      </div>
    </div>

    <!-- 展开总览 -->
    <div v-if="expanded" class="mh-expand">
      <div class="overview-grid">
        <div
          v-for="(row, i) in overviewRows"
          :key="i"
          class="overview-item"
        >
          <span class="ov-label">{{ row.label }}</span>
          <span class="ov-value">{{ row.value }}</span>
        </div>
      </div>

      <!-- 己方队友 / 对手信息（需完整对局数据-详情） -->
      <MatchTeamTable
        v-if="detail"
        :participants="participants"
        :champion-map="championMap"
        :highlight-puuid="puuid"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Game } from '@/utils/match-history/types';
import { toBasicInfo, toParticipants } from '@/utils/match-history/adapter';
import {
  toFixed,
  formatDurationClock,
  formatRelativeTime
} from '@/utils/match-history/format';
import { analyzeGame } from '@/utils/match-history/analysis';
import { computeMatchTags, computeMultikillTags } from '@/utils/match-history/tags';
import {
  getChampionName,
  getChampionAlias,
  getChampionSquareIcon,
  getChampionIconSrc,
  getItemIcon,
  getItemInfo,
  getKiwiAugment,
  loadKiwiAugments,
  loadItemMap,
  loadMapNames,
  getMapName,
  stripItemStatsFromHtml
} from '@/utils/match-history/images';
import { getQueueName, loadQueueNames } from '@/utils/match-history/queue-names';
import type { KiwiAugment, ItemInfo, ChampionMeta } from '@/utils/match-history/images';
import HexagonStats from './hexagon-stats.vue';
import MatchTeamTable from './match-team-table.vue';

const props = defineProps<{
  game: Game;
  detail: Game | null;
  puuid: string;
  championMap: Map<number, ChampionMeta>;
}>();

const expanded = ref(false);

const toggleExpand = () => {
  expanded.value = !expanded.value;
};

// ===== 基础数据（优先使用详情，详情未加载时回退到列表数据） =====
// 注意：原始 LCU Game 的 participants 是未转换数据（stats 嵌套、item0-6 等），
// 必须经 toBasicInfo / toParticipants 转成 MatchBasicInfo / MatchParticipant
const basic = computed(() => toBasicInfo(props.detail ?? props.game));
const participants = computed(() => toParticipants(props.detail ?? props.game, basic.value));
const participant = computed(
  () =>
    participants.value.find((p) => p.puuid === props.puuid) ??
    participants.value[0] ??
    null
);

const result = computed(() => participant.value?.winResult ?? 'abort');
const resultClass = computed(() => {
  switch (result.value) {
    case 'win':
      return 'is-win';
    case 'loss':
      return 'is-loss';
    default:
      return 'is-abnormal';
  }
});
const resultText = computed(() => {
  switch (result.value) {
    case 'win':
      return '胜利';
    case 'loss':
      return '失败';
    case 'remake':
      return '重开';
    default:
      return '异常';
  }
});

// ===== 英雄 =====
const championId = computed(() => participant.value?.championId ?? 0);
const championName = computed(() => getChampionName(championId.value, props.championMap));
const championAlias = computed(() => getChampionAlias(championId.value, props.championMap));
const championIcon = computed(
  () => championAlias.value && getChampionSquareIcon(championAlias.value)
);
/** LCU champion-icons 头像（异步加载，覆盖更全）；未加载完时回退到 CDN 头像 */
const championIconSrc = ref('');

// ===== 模式 / 地图（LCU queues.json / maps.json，静态表兜底） =====
const queueMap = ref<Map<number, string>>(new Map());
const mapMap = ref<Map<number, string>>(new Map());
const queueName = computed(() => getQueueName(basic.value.queueId, queueMap.value));
const mapName = computed(() => getMapName(basic.value.mapId, mapMap.value));

// ===== 装备 =====
const participantItems = computed(() => participant.value?.items ?? []);

// ===== KDA =====
const kda = computed(() => participant.value?.kda ?? 0);
const kdaRatioText = computed(() => {
  if (summary.value) {
    const kp = summary.value.summary.killParticipation ?? 0;
    return `${toFixed(kda.value)} (${toFixed(kp * 100)}%)`;
  }
  return toFixed(kda.value);
});

// ===== 伤害 =====
const damageText = computed(() =>
  participant.value
    ? `${(participant.value.totalDamageDealtToChampions ?? 0).toLocaleString()} 伤害`
    : ''
);

/** 汇总分析（需要完整对局数据-详情，未加载时为 null） */
const summary = computed(() => (props.detail ? analyzeGame(props.detail, props.puuid) : null));
const akariTotal = computed(() => summary.value?.akariScore.total ?? null);
const akariText = computed(() => (summary.value ? toFixed(akariTotal.value ?? 0) : '—'));

const csPerMinute = computed(() =>
  basic.value.gameDuration > 0
    ? (participant.value?.cs ?? 0) / (basic.value.gameDuration / 60)
    : 0
);

/** 占比文本：有详情显示百分比，否则显示占位符 */
const shareText = (v: number | null | undefined): string => {
  if (v === null || v === undefined) {
    return '—';
  }
  return `${toFixed(v * 100)}%`;
};

// ===== 徽章 =====
const badges = computed(() => {
  if (!participant.value) {
    return [];
  }
  if (props.detail) {
    return computeMatchTags(participant.value, participants.value);
  }
  // 详情未加载时仅显示多杀徽章（列表数据即可计算）
  return computeMultikillTags(participant.value);
});

// ===== 底部信息行 =====
const metaText = computed(() =>
  [
    queueName.value,
    formatDurationClock(basic.value.gameDuration),
    formatRelativeTime(basic.value.gameCreation),
    mapName.value
  ]
    .filter(Boolean)
    .join(' · ')
);

// ===== 展开总览 =====
const overviewRows = computed(() => {
  const p = participant.value;
  const s = summary.value?.summary;
  if (!p) {
    return [];
  }
  return [
    { label: '结果', value: resultText.value },
    { label: '英雄', value: championName.value },
    { label: 'KDA', value: `${p.kills} / ${p.deaths} / ${p.assists}` },
    { label: '参团率', value: s ? shareText(s.killParticipation) : '—' },
    { label: '伤害', value: (p.totalDamageDealtToChampions ?? 0).toLocaleString() },
    { label: '伤害占比', value: s ? shareText(s.championDamagePercentageOfTeam) : '—' },
    { label: '承伤', value: (p.totalDamageTaken ?? 0).toLocaleString() },
    { label: '承伤占比', value: s ? shareText(s.damageTakenPercentageOfTeam) : '—' },
    { label: '经济', value: (p.goldEarned ?? 0).toLocaleString() },
    { label: '经济占比', value: s ? shareText(s.goldPercentageOfTeam) : '—' },
    { label: '补刀', value: `${p.cs}（${toFixed(csPerMinute.value)}/min）` },
    { label: '伤转率', value: s ? toFixed(s.damageGoldEfficiency) : '—' },
    { label: '控制时长', value: `${(p.timeCCingOthers ?? 0).toFixed(1)}s` },
    { label: '视野得分', value: toFixed(p.visionScore ?? 0) },
    { label: 'Akari 评分', value: akariText.value }
  ];
});

const augments = computed(() => {
  const list = participant.value?.augments ?? [];
  return list.filter((id) => id && id !== 0);
});

// ===== 海克斯强化 =====
const augmentMap = ref<Map<number, KiwiAugment>>(new Map());
// ===== 装备信息 =====
const itemMap = ref<Map<number, ItemInfo>>(new Map());

onMounted(async () => {
  const [a, i, q, m, icon] = await Promise.all([
    loadKiwiAugments(),
    loadItemMap(),
    loadQueueNames(),
    loadMapNames(),
    getChampionIconSrc(championId.value, championAlias.value || undefined)
  ]);
  augmentMap.value = a;
  itemMap.value = i;
  queueMap.value = q;
  mapMap.value = m;
  if (icon) {
    championIconSrc.value = icon;
  }
});

const getAugmentIcon = (id: number): string => {
  return getKiwiAugment(id, augmentMap.value)?.icon || '';
};

const augmentName = (id: number): string => {
  return getKiwiAugment(id, augmentMap.value)?.nameCn || `海克斯强化 #${id}`;
};

const getAugmentDesc = (id: number): string => {
  return getKiwiAugment(id, augmentMap.value)?.desc || '';
};

/** 海克斯强化稀有度配色（与 LeagueAkari 保持一致） */
const augmentRarityClass = (id: number): string => {
  const level = getKiwiAugment(id, augmentMap.value)?.level;
  switch (level) {
    case 'kPrismatic':
      return 'augment-prismatic';
    case 'kGold':
      return 'augment-gold';
    case 'kSilver':
      return 'augment-silver';
    case 'kBronze':
      return 'augment-bronze';
    default:
      return '';
  }
};

const formatRarity = (id: number): string => {
  const level = getKiwiAugment(id, augmentMap.value)?.level;
  switch (level) {
    case 'kPrismatic':
      return '棱彩';
    case 'kGold':
      return '金色';
    case 'kSilver':
      return '银色';
    case 'kBronze':
      return '青铜';
    default:
      return '';
  }
};

// ===== 装备工具 =====
const getItemInfoOf = (itemId: number): ItemInfo | undefined => {
  return getItemInfo(itemId, itemMap.value);
};

const itemName = (itemId: number): string => {
  return getItemInfoOf(itemId)?.name || `装备 ${itemId}`;
};

const itemPrice = (itemId: number): string => {
  const info = getItemInfoOf(itemId);
  if (!info) {
    return '';
  }
  const { goldTotal, goldBase } = info;
  return goldBase > 0 && goldBase !== goldTotal
    ? `${goldTotal} G (合成 ${goldBase} G)`
    : `${goldTotal} G`;
};

const itemFromNames = (itemId: number): string[] => {
  const info = getItemInfoOf(itemId);
  if (!info) {
    return [];
  }
  return info.from.map((id) => getItemInfoOf(id)?.name || `#${id}`);
};

/** 装备属性行（plaintext，如 "110 法术强度 15 法术穿透"） */
const itemStatsText = (itemId: number): string => {
  return getItemInfoOf(itemId)?.plaintext || '';
};

/** 装备被动/效果描述（保留 HTML 标签与换行，直接用 v-html 渲染，去掉属性段避免重复） */
const itemDescHtml = (itemId: number): string => {
  const info = getItemInfoOf(itemId);
  if (!info) {
    return '';
  }
  return stripItemStatsFromHtml(info.description || '');
};
</script>

<style scoped lang="less">
  .mh-item-wrap {
    border-radius: 8px;
    overflow: hidden;
    background: #1b1f2a;
  }

  .mh-row {
    display: flex;
    align-items: stretch;
  }

  .mh-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .mh-side {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 14px;
    background: #1b1f2a;
    border-left: 1px solid rgba(255, 255, 255, 0.06);
  }

  .mh-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 14px;
    background: #1b1f2a;
    border-left: 4px solid #4a5568;
    cursor: pointer;
    transition: background 0.2s;
    flex: 1;
    min-height: 52px;

    &:hover {
      background: #232938;
    }

    &.is-win {
      border-left-color: #3b82f6;
    }
    &.is-loss {
      border-left-color: #ef4444;
    }
    &.is-abnormal {
      border-left-color: #6b7280;
    }
    &.is-expanded {
      background: #232938;
    }
  }

  // ===== 英雄头像 =====
  .mh-champion {
    flex-shrink: 0;

    .champion-icon {
      width: 52px;
      height: 52px;
      border-radius: 8px;
      border: 2px solid #4a5568;
      object-fit: cover;
      display: block;
    }

    .is-win & .champion-icon {
      border-color: #3b82f6;
    }
    .is-loss & .champion-icon {
      border-color: #ef4444;
    }
    .is-abnormal & .champion-icon {
      border-color: #6b7280;
    }
  }

  // ===== 装备（单行不换行） =====
  .mh-items {
    display: flex;
    gap: 4px;
    flex-wrap: nowrap;
    flex-shrink: 0;

    .item-icon {
      width: 28px;
      height: 28px;
      border-radius: 5px;
      object-fit: cover;
      display: block;
      transition: box-shadow 0.15s;

      &:hover {
        box-shadow: 0 0 0 2px rgba(247, 201, 106, 0.85);
      }
    }

    .item-slot {
      width: 28px;
      height: 28px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
  }

  // ===== 海克斯强化（列表内，无需详情） =====
  .mh-augments {
    display: flex;
    gap: 4px;
    flex-shrink: 0;

    .augment-icon {
      width: 26px;
      height: 26px;
      border-radius: 4px;
      object-fit: cover;
      display: block;
      box-sizing: border-box;
      background: #10131c;

      // 稀有度配色（与 LeagueAkari 一致）
      &.augment-prismatic {
        border: 1px solid transparent;
        border-image: linear-gradient(135deg, #e78fff, #8b05b0) 1;
        background-color: rgb(45, 37, 66);
      }
      &.augment-gold {
        border: 1px solid rgb(255, 183, 0);
        background-color: rgb(50, 37, 5);
      }
      &.augment-silver {
        border: 1px solid rgb(180, 180, 180);
        background-color: rgb(35, 35, 34);
      }
      &.augment-bronze {
        border: 1px solid rgb(205, 127, 50);
        background-color: rgb(50, 30, 15);
      }
    }
  }

  .item-tooltip {
    max-width: 280px;

    .item-tooltip-name {
      font-weight: 700;
      color: #f7c96a;
      margin-bottom: 4px;
    }
    .item-tooltip-price {
      color: #c9b37a;
      font-size: 12px;
      margin-bottom: 6px;
    }
    .item-tooltip-from {
      color: #94a3b8;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .item-tooltip-stats {
      color: #e2e8f0;
      font-size: 12px;
      line-height: 1.6;
      padding: 6px 8px;
      margin-bottom: 6px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 4px;
    }
    .item-tooltip-desc {
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.6;
    }
  }

  // ===== KDA =====
  .mh-kda {
    flex-shrink: 0;
    min-width: 84px;

    .kda-main {
      font-size: 16px;
      font-weight: 600;
      color: #e2e8f0;
      white-space: nowrap;
    }
    .kda-sub {
      font-size: 12px;
      color: #8b93a5;
      white-space: nowrap;
    }
  }

  // ===== 伤害 =====
  .mh-damage {
    flex-shrink: 0;
    min-width: 96px;

    .dmg-share {
      font-size: 18px;
      font-weight: 700;
      color: #e2e8f0;
      white-space: nowrap;
    }
    .dmg-value {
      font-size: 12px;
      color: #8b93a5;
      white-space: nowrap;
    }
  }

  // ===== 评级徽章（第二行） =====
  .mh-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 18px 8px 18px;
    border-left: 4px solid #4a5568;

    &.is-win {
      border-left-color: #3b82f6;
    }
    &.is-loss {
      border-left-color: #ef4444;
    }
    &.is-abnormal {
      border-left-color: #6b7280;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1.4;
      white-space: nowrap;
      cursor: default;
    }

    .badge-rose {
      color: #fda4af;
      background: rgba(244, 63, 94, 0.16);
      border: 1px solid rgba(244, 63, 94, 0.35);
    }
    .badge-red {
      color: #fca5a5;
      background: rgba(239, 68, 68, 0.16);
      border: 1px solid rgba(239, 68, 68, 0.35);
    }
    .badge-slate {
      color: #cbd5e1;
      background: rgba(100, 116, 139, 0.2);
      border: 1px solid rgba(100, 116, 139, 0.4);
    }
    .badge-emerald {
      color: #6ee7b7;
      background: rgba(16, 185, 129, 0.16);
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .badge-stone {
      color: #d6d3d1;
      background: rgba(120, 113, 108, 0.2);
      border: 1px solid rgba(120, 113, 108, 0.4);
    }
    .badge-gold {
      color: #fde047;
      background: rgba(234, 179, 8, 0.16);
      border: 1px solid rgba(234, 179, 8, 0.35);
    }
    .badge-violet {
      color: #c4b5fd;
      background: rgba(139, 92, 246, 0.16);
      border: 1px solid rgba(139, 92, 246, 0.35);
    }
    .badge-cyan {
      color: #67e8f9;
      background: rgba(6, 182, 212, 0.16);
      border: 1px solid rgba(6, 182, 212, 0.35);
    }
    .badge-orange {
      color: #fdba74;
      background: rgba(249, 115, 22, 0.16);
      border: 1px solid rgba(249, 115, 22, 0.35);
    }
    .badge-fuchsia {
      color: #f0abfc;
      background: rgba(217, 70, 239, 0.16);
      border: 1px solid rgba(217, 70, 239, 0.35);
    }
    .badge-lime {
      color: #bef264;
      background: rgba(132, 204, 22, 0.16);
      border: 1px solid rgba(132, 204, 22, 0.35);
    }
  }

  // ===== 操作 =====
  .mh-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    margin-left: auto;

    .expand-arrow {
      color: #8b93a5;
      font-size: 14px;
      transition: transform 0.2s;

      &.open {
        transform: rotate(180deg);
      }
    }

    .detail-btn {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.06);
      color: #cbd5e1;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }
    }
  }

  // ===== 底部信息行 =====
  .mh-meta {
    padding: 6px 18px 8px 18px;
    font-size: 12px;
    color: #8b93a5;
    border-left: 4px solid #4a5568;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.is-win {
      border-left-color: #3b82f6;
    }
    &.is-loss {
      border-left-color: #ef4444;
    }
    &.is-abnormal {
      border-left-color: #6b7280;
    }
  }

  // ===== 展开总览 =====
  .mh-expand {
    padding: 12px 14px;
    background: #161a24;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px 16px;

    .overview-item {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 13px;

      .ov-label {
        color: #8b93a5;
      }
      .ov-value {
        color: #e2e8f0;
        font-weight: 500;
        text-align: right;
      }
    }
  }

  .augment-tooltip {
    max-width: 280px;

    .augment-tooltip-name {
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;

      .augment-rarity {
        font-weight: 400;
        font-size: 12px;
        color: #94a3b8;
        margin-left: 6px;
      }
    }
    .augment-tooltip-desc {
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.5;
    }
  }
</style>
