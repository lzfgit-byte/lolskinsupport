<template>
  <div class="mh-item-wrap" @click="toggleExpand">
    <div
      class="mh-item"
      :class="{
        'is-win': result === 'win',
        'is-loss': result === 'loss',
        'is-abnormal': result === 'remake' || result === 'abort',
        'is-expanded': expanded
      }"
    >
      <!-- 序号 -->
      <div class="mh-col mh-index">{{ index + 1 }}</div>

      <!-- 英雄 -->
      <div class="mh-col mh-champion">
        <img class="champion-icon" :src="championIcon" :alt="championName" loading="lazy" />
        <div class="champion-meta">
          <div class="champion-name" :title="championName">{{ championName || '未知英雄' }}</div>
          <div class="champion-role">{{ queueName }}</div>
        </div>
      </div>

      <!-- 结果 -->
      <div class="mh-col mh-result">
        <span class="result-badge" :class="result">{{ resultText }}</span>
      </div>

      <!-- KDA -->
      <div class="mh-col mh-kda">
        <span class="kda-num" :class="{ strong: kda >= 3 }">{{ toFixed(kda) }}</span>
        <span class="kda-detail">
          {{ participant?.kills }} / {{ participant?.deaths }} / {{ participant?.assists }}
        </span>
      </div>

      <!-- 伤害（含团队占比） -->
      <div class="mh-col mh-stats">
        <div class="stat-row">{{ formatExtremeNumber(participant?.totalDamageDealtToChampions || 0) }}</div>
        <div class="stat-row sub">{{ shareText(summary?.summary.championDamagePercentageOfTeam) }} 伤害</div>
      </div>

      <!-- 承伤（含团队占比） -->
      <div class="mh-col mh-stats">
        <div class="stat-row">{{ formatExtremeNumber(participant?.totalDamageTaken || 0) }}</div>
        <div class="stat-row sub">{{ shareText(summary?.summary.damageTakenPercentageOfTeam) }} 承伤</div>
      </div>

      <!-- 装备 -->
      <div class="mh-col mh-items">
        <a-tooltip v-for="(itemId, i) in participantItems" :key="i">
          <template #title>
            <div class="item-tooltip">
              <div class="item-tooltip-name">
                {{ itemName(itemId) }}
                <span class="item-tooltip-id">({{ itemId }})</span>
              </div>
              <div v-if="itemPrice(itemId)" class="item-tooltip-price">{{ itemPrice(itemId) }}</div>
              <div v-if="itemFromNames(itemId).length" class="item-tooltip-from">
                合成：{{ itemFromNames(itemId).join('、') }}
              </div>
              <div v-if="itemDesc(itemId)" class="item-tooltip-desc">{{ itemDesc(itemId) }}</div>
            </div>
          </template>
          <img class="item-icon" :src="getItemIcon(itemId)" loading="lazy" />
        </a-tooltip>
      </div>

      <!-- Akari 评分 -->
      <div class="mh-col mh-akari">
        <span class="akari-score" :class="{ good: (akariTotal ?? 0) >= 6.5 }">
          {{ akariText }}
        </span>
      </div>

      <!-- 时间 -->
      <div class="mh-col mh-time">
        <div class="stat-row">{{ formatDuration(game.gameDuration) }}</div>
        <div class="stat-row sub">{{ formatDateTime(game.gameCreation) }}</div>
      </div>

      <!-- 展开箭头 / 详情 -->
      <div class="mh-col mh-actions">
        <span class="expand-arrow" :class="{ open: expanded }">▾</span>
        <button class="detail-btn" @click.stop="$emit('open-detail', game)">详情</button>
      </div>
    </div>

    <!-- 评级标签（始终显示） -->
    <div v-if="tags.length" class="mh-tags-row">
      <span
        v-for="(tag, i) in tags"
        :key="i"
        class="player-tag"
        :class="`tag-${tag.color}`"
        :title="tag.content"
      >
        {{ tag.label }}
      </span>
    </div>

    <!-- 展开总览 -->
    <div v-if="expanded" class="mh-expand">
      <div class="expand-section">
        <div class="section-title">数据总览</div>
        <div class="overview-grid">
          <div class="ov-item">
            <div class="ov-label">伤害</div>
            <div class="ov-value">{{ formatExtremeNumber(participant?.totalDamageDealtToChampions || 0) }}</div>
            <div class="ov-sub">团队占比 {{ shareText(summary?.summary.championDamagePercentageOfTeam) }}</div>
          </div>
          <div class="ov-item">
            <div class="ov-label">承伤</div>
            <div class="ov-value">{{ formatExtremeNumber(participant?.totalDamageTaken || 0) }}</div>
            <div class="ov-sub">团队占比 {{ shareText(summary?.summary.damageTakenPercentageOfTeam) }}</div>
          </div>
          <div class="ov-item">
            <div class="ov-label">经济</div>
            <div class="ov-value">{{ Math.round((participant?.goldEarned ?? 0) / 100) / 10 }}k</div>
            <div class="ov-sub">团队占比 {{ shareText(summary?.summary.goldPercentageOfTeam) }}</div>
          </div>
          <div class="ov-item">
            <div class="ov-label">补刀</div>
            <div class="ov-value">{{ participant?.cs ?? 0 }}</div>
            <div class="ov-sub">分均 {{ toFixed(csPerMinute) }}</div>
          </div>
          <div class="ov-item">
            <div class="ov-label">视野</div>
            <div class="ov-value">{{ participant?.visionScore ?? 0 }}</div>
            <div class="ov-sub">团队占比 {{ shareText(summary?.summary.visionScorePercentageOfTeam) }}</div>
          </div>
          <div class="ov-item">
            <div class="ov-label">推塔伤害</div>
            <div class="ov-value">{{ formatExtremeNumber(participant?.totalDamageToTowers || 0) }}</div>
            <div class="ov-sub">治疗 {{ formatExtremeNumber(participant?.totalHeal || 0) }}</div>
          </div>
          <div class="ov-item">
            <div class="ov-label">参团率</div>
            <div class="ov-value">{{ shareText(summary?.summary.killParticipation) }}</div>
            <div class="ov-sub">KDA {{ toFixed(kda) }}</div>
          </div>
          <div class="ov-item">
            <div class="ov-label">多杀</div>
            <div class="ov-value multikill">
              <span v-if="participant?.pentaKills" class="mk mk-penta">五杀{{ participant.pentaKills }}</span>
              <span v-if="participant?.quadraKills" class="mk mk-quadra">四杀{{ participant.quadraKills }}</span>
              <span v-if="participant?.tripleKills" class="mk mk-triple">三杀{{ participant.tripleKills }}</span>
              <span v-if="participant?.doubleKills" class="mk mk-double">双杀{{ participant.doubleKills }}</span>
              <span
                v-if="
                  !(participant?.pentaKills ||
                    participant?.quadraKills ||
                    participant?.tripleKills ||
                    participant?.doubleKills)
                "
                class="mk-none"
              >-</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 海克斯强化 -->
      <div v-if="augments.length" class="expand-section">
        <div class="section-title">海克斯强化</div>
        <div class="augment-row">
          <a-tooltip v-for="augmentId in augments" :key="augmentId">
            <template #title>
              <div class="augment-tooltip">
                <div class="augment-tooltip-name">{{ augmentName(augmentId) }}</div>
                <div v-if="formatRarity(augmentId)" class="augment-tooltip-rarity">
                  <span class="rarity-indicator" :class="rarityClass(augmentId)"></span>
                  {{ formatRarity(augmentId) }}
                </div>
                <div v-if="getAugmentDesc(augmentId)" class="augment-tooltip-desc">
                  {{ getAugmentDesc(augmentId) }}
                </div>
              </div>
            </template>
            <div class="augment-item">
              <img
                v-if="getAugmentIcon(augmentId)"
                class="augment-icon"
                :class="augmentLevelClass(augmentId)"
                :src="getAugmentIcon(augmentId)"
                loading="lazy"
              />
              <span v-else class="augment-chip">⬡ {{ augmentId }}</span>
            </div>
          </a-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { toBasicInfo, toParticipants } from '@/utils/match-history/adapter';
  import { analyzeGame } from '@/utils/match-history/analysis';
  import {
    formatDateTime,
    formatDuration,
    formatExtremeNumber,
    toFixed
  } from '@/utils/match-history/format';
  import {
    getChampionAlias,
    getChampionName,
    getChampionSquareIcon,
    getItemIcon,
    getItemInfo,
    getKiwiAugment,
    loadItemMap,
    loadKiwiAugments,
    stripItemHtml,
    type ChampionMeta,
    type ItemInfo,
    type KiwiAugment
  } from '@/utils/match-history/images';
  import { getQueueName } from '@/utils/match-history/queue-names';
  import { computeMatchTags } from '@/utils/match-history/tags';
  import type { Game } from '@/utils/match-history/types';

  const props = defineProps<{
    game: Game;
    /** 对局详情（含全员），团队占比/参团率/标签等依赖它 */
    detail?: Game | null;
    puuid: string;
    championMap: Map<number, ChampionMeta>;
    index: number;
  }>();

  defineEmits<{ (e: 'open-detail', game: Game): void }>();

  const expanded = ref(false);

  const toggleExpand = () => {
    expanded.value = !expanded.value;
  };

  const effectiveGame = computed(() => props.detail || props.game);

  const basic = computed(() => toBasicInfo(effectiveGame.value));
  const participants = computed(() => toParticipants(effectiveGame.value, basic.value));
  const participant = computed(() => participants.value.find((p) => p.puuid === props.puuid));

  const result = computed(() => participant.value?.winResult ?? 'loss');
  const resultText = computed(() => {
    switch (result.value) {
      case 'win':
        return '胜利';
      case 'loss':
        return '失败';
      case 'remake':
        return '重开';
      case 'abort':
        return '取消';
      default:
        return '-';
    }
  });

  const championId = computed(
    () => participant.value?.championId ?? effectiveGame.value.participants[0]?.championId ?? 0
  );
  const championName = computed(() => getChampionName(championId.value, props.championMap));
  const championAlias = computed(() => getChampionAlias(championId.value, props.championMap));
  const championIcon = computed(
    () => championAlias.value && getChampionSquareIcon(championAlias.value)
  );
  const queueName = computed(() => getQueueName(basic.value.queueId));

  const participantItems = computed(() => participant.value?.items ?? []);

  const kda = computed(() => participant.value?.kda ?? 0);
  const csPerMinute = computed(() =>
    basic.value.gameDuration > 0 ? (participant.value?.cs ?? 0) / (basic.value.gameDuration / 60) : 0
  );

  /** 团队占比/Akari 评分需要完整对局数据（详情），未加载时返回 null */
  const summary = computed(() =>
    props.detail ? analyzeGame(props.detail, props.puuid) : null
  );
  const akariTotal = computed(() => summary.value?.akariScore.total ?? null);
  const akariText = computed(() =>
    summary.value ? toFixed(akariTotal.value ?? 0) : '—'
  );

  /** 占比文本：有详情显示百分比，否则显示占位符 */
  const shareText = (v: number | null | undefined): string => {
    if (v === null || v === undefined) {
      return '—';
    }
    return `${toFixed(v * 100)}%`;
  };

  const tags = computed(() => {
    if (!props.detail || !participant.value) {
      return [];
    }
    return computeMatchTags(participant.value, participants.value);
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
    augmentMap.value = await loadKiwiAugments();
    itemMap.value = await loadItemMap();
  });

  const getAugmentIcon = (id: number): string => {
    return getKiwiAugment(id, augmentMap.value)?.icon || '';
  };

  const augmentName = (id: number): string => {
    return getKiwiAugment(id, augmentMap.value)?.nameCn || `海克斯强化 #${id}`;
  };

  const augmentLevelClass = (id: number): string => {
    const level = getKiwiAugment(id, augmentMap.value)?.level;
    switch (level) {
      case 'kPrismatic':
        return 'level-prismatic';
      case 'kGold':
        return 'level-gold';
      case 'kSilver':
        return 'level-silver';
      default:
        return '';
    }
  };

  const getAugmentDesc = (id: number): string => {
    return getKiwiAugment(id, augmentMap.value)?.desc || '';
  };

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
      ? `${goldTotal} G（合成价 ${goldBase} G）`
      : `${goldTotal} G`;
  };

  const itemFromNames = (itemId: number): string[] => {
    const info = getItemInfoOf(itemId);
    if (!info) {
      return [];
    }
    return info.from.map((id) => getItemInfoOf(id)?.name || `#${id}`);
  };

  const itemDesc = (itemId: number): string => {
    const info = getItemInfoOf(itemId);
    if (!info) {
      return '';
    }
    return stripItemHtml(info.description || info.plaintext);
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

  const rarityClass = (id: number): string => {
    const level = getKiwiAugment(id, augmentMap.value)?.level;
    switch (level) {
      case 'kPrismatic':
        return 'rarity-prismatic';
      case 'kGold':
        return 'rarity-gold';
      case 'kSilver':
        return 'rarity-silver';
      case 'kBronze':
        return 'rarity-bronze';
      default:
        return '';
    }
  };
</script>

<style scoped lang="less">
  .mh-item-wrap {
    border-radius: 8px;
    overflow: hidden;
  }

  .mh-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    border-radius: 8px;
    background: #1f2430;
    border-left: 4px solid #4a5568;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: #2a3140;
    }

    &.is-win {
      border-left-color: #38a169;
    }
    &.is-loss {
      border-left-color: #e53e3e;
    }
    &.is-abnormal {
      border-left-color: #718096;
    }
    &.is-expanded {
      border-radius: 8px 8px 0 0;
      background: #2a3140;
    }
  }

  .mh-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .mh-index {
    width: 24px;
    color: #8b93a5;
    font-size: 12px;
    flex-shrink: 0;
  }

  .mh-champion {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    width: 140px;
    flex-shrink: 0;

    .champion-icon {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      object-fit: cover;
      background: #2d3342;
    }
    .champion-meta {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .champion-name {
      color: #e5e7eb;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 88px;
    }
    .champion-role {
      color: #8b93a5;
      font-size: 11px;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 88px;
    }
  }

  .mh-result {
    width: 56px;
    flex-shrink: 0;

    .result-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;

      &.win {
        background: rgba(56, 161, 105, 0.85);
      }
      &.loss {
        background: rgba(229, 62, 62, 0.85);
      }
      &.remake,
      &.abort {
        background: rgba(113, 128, 150, 0.85);
      }
    }
  }

  .mh-kda {
    width: 92px;
    flex-shrink: 0;

    .kda-num {
      color: #e5e7eb;
      font-size: 15px;
      font-weight: 700;

      &.strong {
        color: #48bb78;
      }
    }
    .kda-detail {
      color: #8b93a5;
      font-size: 12px;
      margin-top: 2px;
    }
  }

  .mh-stats {
    width: 82px;
    flex-shrink: 0;

    .stat-row {
      color: #e5e7eb;
      font-size: 12px;

      &.sub {
        color: #8b93a5;
        margin-top: 2px;
        font-size: 11px;
      }
    }
  }

  .mh-items {
    flex-direction: row;
    gap: 4px;
    flex: 1;
    min-width: 150px;

    .item-icon {
      width: 26px;
      height: 26px;
      border-radius: 4px;
      background: #2d3342;
      object-fit: cover;
    }
  }

  .mh-akari {
    width: 48px;
    flex-shrink: 0;

    .akari-score {
      color: #e5e7eb;
      font-size: 14px;
      font-weight: 700;

      &.good {
        color: #48bb78;
      }
    }
  }

  .mh-time {
    width: 96px;
    flex-shrink: 0;

    .stat-row {
      color: #e5e7eb;
      font-size: 12px;

      &.sub {
        color: #8b93a5;
        margin-top: 2px;
        font-size: 11px;
      }
    }
  }

  .mh-actions {
    width: 76px;
    flex-shrink: 0;
    flex-direction: row;
    align-items: center;
    gap: 8px;

    .expand-arrow {
      color: #8b93a5;
      font-size: 14px;
      transition: transform 0.2s;

      &.open {
        transform: rotate(180deg);
      }
    }

    .detail-btn {
      padding: 2px 8px;
      font-size: 12px;
      color: #d8c99b;
      background: #27313b;
      border: 1px solid #33404d;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        border-color: #6d9f43;
        color: #6d9f43;
      }
    }
  }

  /* ===== 评级标签行 ===== */
  .mh-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    background: #1f2430;
    border-radius: 0 0 8px 8px;
    padding: 4px 14px 8px;

    .player-tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      cursor: default;

      &.tag-rose {
        background: rgba(190, 18, 60, 0.9);
      }
      &.tag-red {
        background: rgba(185, 28, 28, 0.9);
      }
      &.tag-slate {
        background: rgba(51, 65, 85, 0.95);
      }
      &.tag-emerald {
        background: rgba(4, 120, 87, 0.9);
      }
      &.tag-stone {
        background: rgba(68, 64, 60, 0.95);
      }
      &.tag-gold {
        background: rgba(180, 140, 30, 0.9);
      }
      &.tag-violet {
        background: rgba(109, 40, 217, 0.9);
      }
      &.tag-cyan {
        background: rgba(14, 116, 144, 0.9);
      }
      &.tag-orange {
        background: rgba(194, 65, 12, 0.9);
      }
      &.tag-fuchsia {
        background: rgba(162, 28, 175, 0.9);
      }
      &.tag-lime {
        background: rgba(63, 98, 18, 0.95);
      }
    }
  }

  /* ===== 展开区域 ===== */
  .mh-expand {
    background: #1b212c;
    border-radius: 0 0 8px 8px;
    padding: 12px 16px;

    .expand-section + .expand-section {
      margin-top: 12px;
    }

    .section-title {
      color: #8b93a5;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;

      .player-tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        color: #fff;
        cursor: default;

        &.tag-rose {
          background: rgba(190, 18, 60, 0.9);
        }
        &.tag-red {
          background: rgba(185, 28, 28, 0.9);
        }
        &.tag-slate {
          background: rgba(51, 65, 85, 0.95);
        }
        &.tag-emerald {
          background: rgba(4, 120, 87, 0.9);
        }
        &.tag-stone {
          background: rgba(68, 64, 60, 0.95);
        }
        &.tag-gold {
          background: rgba(180, 140, 30, 0.9);
        }
      }

      .tag-empty {
        color: #6b7485;
        font-size: 12px;
      }
    }

    .overview-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;

      .ov-item {
        background: #232a37;
        border-radius: 6px;
        padding: 8px 10px;

        .ov-label {
          color: #8b93a5;
          font-size: 11px;
        }
        .ov-value {
          color: #e5e7eb;
          font-size: 15px;
          font-weight: 700;
          margin-top: 2px;

          &.multikill {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;

            .mk {
              font-size: 11px;
              padding: 1px 5px;
              border-radius: 3px;
              font-weight: 600;
              color: #fff;

              &.mk-penta {
                background: rgba(159, 122, 234, 0.9);
              }
              &.mk-quadra {
                background: rgba(217, 119, 6, 0.9);
              }
              &.mk-triple {
                background: rgba(220, 38, 38, 0.9);
              }
              &.mk-double {
                background: rgba(147, 51, 234, 0.85);
              }
            }

            .mk-none {
              color: #6b7485;
              font-size: 12px;
            }
          }
        }
        .ov-sub {
          color: #6b7485;
          font-size: 11px;
          margin-top: 2px;
        }
      }
    }

    .augment-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;

      .augment-item {
        display: inline-flex;
      }

      .augment-icon {
        width: 36px;
        height: 36px;
        border-radius: 6px;
        border: 2px solid rgba(148, 163, 184, 0.6);
        object-fit: cover;
        background: #2d3342;
        cursor: default;

        &.level-prismatic {
          border-color: #c084fc;
          box-shadow: 0 0 6px rgba(192, 132, 252, 0.5);
        }
        &.level-gold {
          border-color: #f59e0b;
        }
        &.level-silver {
          border-color: #94a3b8;
        }
      }

      .augment-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 12px;
        color: #fcd34d;
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.4);
        cursor: default;
      }
    }

    .augment-tooltip {
      .augment-tooltip-name {
        font-weight: 600;
        margin-bottom: 4px;
      }
      .augment-tooltip-rarity {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
        font-size: 12px;
      }
      .rarity-indicator {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #94a3b8;

        &.rarity-prismatic {
          background: #c084fc;
        }
        &.rarity-gold {
          background: #f59e0b;
        }
        &.rarity-silver {
          background: #94a3b8;
        }
        &.rarity-bronze {
          background: #d97706;
        }
      }
      .augment-tooltip-desc {
        font-size: 12px;
        opacity: 0.85;
        max-width: 260px;
        white-space: normal;
      }
    }

    .item-tooltip {
      max-width: 280px;
      .item-tooltip-name {
        font-weight: 600;
      }
      .item-tooltip-id {
        opacity: 0.6;
        font-weight: 400;
        margin-left: 2px;
      }
      .item-tooltip-price {
        font-size: 12px;
        color: #fcd34d;
        margin: 4px 0;
      }
      .item-tooltip-from {
        font-size: 12px;
        opacity: 0.85;
        margin-bottom: 4px;
      }
      .item-tooltip-desc {
        font-size: 12px;
        opacity: 0.8;
        white-space: normal;
      }
    }
  }
</style>
