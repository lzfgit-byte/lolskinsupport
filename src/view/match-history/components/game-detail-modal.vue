<template>
  <a-modal
    :open="open"
    :title="modalTitle"
    :footer="null"
    width="960px"
    :body-style="{ background: '#191d24', padding: '16px' }"
    @cancel="$emit('close')"
  >
    <div v-if="game" class="gd-container">
      <div v-for="team in teams" :key="team.teamId" class="gd-team">
        <div class="gd-team-header" :class="team.teamId === 100 ? 'blue' : 'red'">
          <span class="gd-team-name">{{ team.teamId === 100 ? '蓝方' : '红方' }}</span>
          <span class="gd-team-result">{{ team.win ? '胜利' : '失败' }}</span>
        </div>

        <div class="gd-player" v-for="p in team.participants" :key="p.participantId">
          <img class="gd-champion" :src="getChampionIcon(p.championId)" loading="lazy" />
          <div class="gd-name" :title="p.gameName">{{ p.gameName || '未知玩家' }}</div>
          <div class="gd-kda">
            <span class="kda-main">{{ p.kills }} / {{ p.deaths }} / {{ p.assists }}</span>
            <span class="kda-sub">{{ toFixed(p.kda) }}</span>
          </div>
          <div class="gd-stat">{{ p.cs }} 补刀</div>
          <div class="gd-stat">{{ toFixed(p.totalDamageDealtToChampions) }} 伤害</div>
          <div class="gd-stat">{{ Math.round(p.goldEarned / 100) / 10 }}k 经济</div>
          <div class="gd-stat">{{ p.visionScore }} 视野</div>
          <div class="gd-items">
            <img
              v-for="(itemId, i) in p.items"
              :key="i"
              class="gd-item"
              :src="getItemIcon(itemId)"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { toBasicInfo, toParticipants, type MatchParticipant } from '@/utils/match-history/adapter';
  import { toFixed } from '@/utils/match-history/format';
  import {
    getChampionAlias,
    getChampionSquareIcon,
    getItemIcon,
    type ChampionMeta
  } from '@/utils/match-history/images';
  import { getQueueName } from '@/utils/match-history/queue-names';
  import type { Game } from '@/utils/match-history/types';

  const props = defineProps<{
    open: boolean;
    game: Game | null;
    championMap: Map<number, ChampionMeta>;
  }>();

  defineEmits<{ (e: 'close'): void }>();

  const formatDuration = (seconds: number) => {
    const m = Math.max(0, Math.floor(seconds / 60));
    const s = seconds % 60;
    return `${m}分${s.toString().padStart(2, '0')}秒`;
  };

  const modalTitle = computed(() => {
    if (!props.game) {
      return '对局详情';
    }
    const basic = toBasicInfo(props.game);
    return `对局详情 · ${getQueueName(basic.queueId)} · ${formatDuration(basic.gameDuration)}`;
  });

  interface TeamView {
    teamId: number;
    win: boolean;
    participants: MatchParticipant[];
  }

  const teams = computed<TeamView[]>(() => {
    if (!props.game) {
      return [];
    }
    const basic = toBasicInfo(props.game);
    const participants = toParticipants(props.game, basic);
    const teams: TeamView[] = [];
    for (const teamId of [100, 200]) {
      const list = participants.filter((p) => p.teamId === teamId);
      if (list.length) {
        const team = props.game.teams.find((t) => t.teamId === teamId);
        teams.push({
          teamId,
          win: team?.win === 'Win',
          participants: list
        });
      }
    }
    return teams;
  });

  const championIcon = (championId: number) => {
    const alias = getChampionAlias(championId, props.championMap);
    return alias ? getChampionSquareIcon(alias) : '';
  };
</script>

<style scoped lang="less">
  .gd-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 70vh;
    overflow: auto;
  }

  .gd-team {
    background: #1f2430;
    border-radius: 8px;
    overflow: hidden;
  }

  .gd-team-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 700;
    color: #e5e7eb;

    &.blue {
      background: rgba(49, 130, 206, 0.25);
    }
    &.red {
      background: rgba(229, 62, 62, 0.25);
    }
  }

  .gd-player {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;

    & + .gd-player {
      border-top: 1px solid #2d3342;
    }
  }

  .gd-champion {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    object-fit: cover;
    background: #2d3342;
  }

  .gd-name {
    width: 120px;
    color: #e5e7eb;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gd-kda {
    display: flex;
    flex-direction: column;
    width: 110px;

    .kda-main {
      color: #e5e7eb;
      font-size: 13px;
      font-weight: 600;
    }
    .kda-sub {
      color: #8b93a5;
      font-size: 11px;
      margin-top: 2px;
    }
  }

  .gd-stat {
    width: 78px;
    color: #cbd5e0;
    font-size: 12px;
  }

  .gd-items {
    display: flex;
    gap: 3px;
    flex: 1;
    min-width: 140px;

    .gd-item {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: #2d3342;
      object-fit: cover;
    }
  }
</style>
