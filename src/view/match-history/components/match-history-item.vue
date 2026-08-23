<template>
  <div
    class="mh-item"
    :class="{
      'is-win': result === 'win',
      'is-loss': result === 'loss',
      'is-abnormal': result === 'remake' || result === 'abort'
    }"
    @click="$emit('open-detail', game)"
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

    <!-- 补刀 / 经济 -->
    <div class="mh-col mh-stats">
      <div class="stat-row">{{ participant?.cs }} 补刀</div>
      <div class="stat-row sub">{{ toFixed(csPerMinute) }} /分</div>
    </div>
    <div class="mh-col mh-stats">
      <div class="stat-row">{{ formatGold }}</div>
      <div class="stat-row sub">伤害 {{ toFixed(participant?.totalDamageDealtToChampions || 0) }}</div>
    </div>

    <!-- 装备 -->
    <div class="mh-col mh-items">
      <img
        v-for="(itemId, i) in participantItems"
        :key="i"
        class="item-icon"
        :src="getItemIcon(itemId)"
        loading="lazy"
      />
    </div>

    <!-- Akari 评分 -->
    <div class="mh-col mh-akari">
      <span class="akari-score" :class="{ good: akariTotal >= 6.5 }">
        {{ toFixed(akariTotal) }}
      </span>
    </div>

    <!-- 时间 -->
    <div class="mh-col mh-time">
      <div class="stat-row">{{ formatDuration(game.gameDuration) }}</div>
      <div class="stat-row sub">{{ formatDateTime(game.gameCreation) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { toBasicInfo, toParticipants } from '@/utils/match-history/adapter';
  import { analyzeGame } from '@/utils/match-history/analysis';
  import { formatDateTime, formatDuration, toFixed } from '@/utils/match-history/format';
  import {
    getChampionAlias,
    getChampionName,
    getChampionSquareIcon,
    getItemIcon,
    type ChampionMeta
  } from '@/utils/match-history/images';
  import { getQueueName } from '@/utils/match-history/queue-names';
  import type { Game } from '@/utils/match-history/types';

  const props = defineProps<{
    game: Game;
    puuid: string;
    championMap: Map<number, ChampionMeta>;
    index: number;
  }>();

  defineEmits<{ (e: 'open-detail', game: Game): void }>();

  const basic = computed(() => toBasicInfo(props.game));
  const participants = computed(() => toParticipants(props.game, basic.value));
  const participant = computed(() =>
    participants.value.find((p) => p.puuid === props.puuid)
  );

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
    () => participant.value?.championId ?? props.game.participants[0]?.championId ?? 0
  );
  const championName = computed(() => getChampionName(championId.value, props.championMap));
  const championAlias = computed(() => getChampionAlias(championId.value, props.championMap));
  const championIcon = computed(() => championAlias.value && getChampionSquareIcon(championAlias.value));
  const queueName = computed(() => getQueueName(basic.value.queueId));

  const participantItems = computed(() => {
    const items = participant.value?.items ?? [];
    return items.length ? items : [];
  });

  const kda = computed(() => participant.value?.kda ?? 0);
  const csPerMinute = computed(() =>
    basic.value.gameDuration > 0 ? (participant.value?.cs ?? 0) / (basic.value.gameDuration / 60) : 0
  );
  const formatGold = computed(() => {
    const gold = participant.value?.goldEarned ?? 0;
    return `${Math.round(gold / 100) / 10}k`;
  });

  const akariTotal = computed(() => {
    const single = analyzeGame(props.game, props.puuid);
    return single?.akariScore.total ?? 0;
  });
</script>

<style scoped lang="less">
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
    width: 110px;
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
    width: 92px;
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
    min-width: 180px;

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
</style>
