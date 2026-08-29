<template>
  <div v-if="teams.length" class="mh-team-table">
    <div v-for="team in teams" :key="team.title" class="team-block">
      <div class="team-header">
        <span class="team-title">{{ team.title }}</span>
        <span class="team-result" :class="team.win ? 'win' : 'loss'">
          {{ team.win ? '胜利' : '失败' }}
        </span>
      </div>

      <!-- 表头：说明各列含义（与数据行共用列宽，保证对齐） -->
      <div class="team-row team-head">
        <span class="col-champ th">英雄</span>
        <span class="col-name th">玩家</span>
        <span class="col-items th">装备</span>
        <span v-if="hasAugments" class="col-augments th" title="海克斯强化选择">海克斯</span>
        <span class="col-num th" title="击杀数">击杀</span>
        <span class="col-num th" title="对英雄伤害">伤害</span>
        <span class="col-num th" title="承受伤害">承伤</span>
        <span class="col-num th" title="击杀/死亡/助攻比值">KDA</span>
        <span class="col-num th" title="治疗量">治疗</span>
        <span class="col-num cs th" title="补刀数">补刀</span>
        <span class="col-kp th" title="参团率（击杀+助攻）/ 队伍总击杀">参团率</span>
        <span class="col-gold th" title="获得经济">经济</span>
        <span class="col-vision th" title="视野得分">视野</span>
        <span class="col-level th" title="英雄等级">等级</span>
      </div>

      <div class="team-rows">
        <div
          v-for="p in team.players"
          :key="p.participantId"
          class="team-row"
          :class="{ 'is-me': p.puuid === highlightPuuid }"
        >
          <span class="col-champ">
            <ChampionAvatar
              :champion-id="p.championId"
              :alias="getChampionAlias(p.championId, championMap)"
              :size="26"
            />
          </span>
          <span
            class="col-name"
            :title="`${p.gameName}${p.tagLine ? '#' + p.tagLine : ''}`"
          >
            {{ p.gameName }}<template v-if="p.tagLine">#{{ p.tagLine }}</template>
          </span>
          <span class="col-items">
            <img
              v-for="(itemId, i) in p.items.slice(0, 6)"
              :key="i"
              v-show="itemId"
              class="item-icon"
              :src="getItemIcon(itemId)"
              :title="`装备 ${itemId}`"
              loading="lazy"
            />
          </span>
          <span v-if="hasAugments" class="col-augments">
            <img
              v-for="id in playerAugments(p)"
              :key="id"
              class="augment-icon"
              :class="augmentRarityClass(id)"
              :src="getKiwiAugment(id, augmentMap)?.icon || ''"
              :title="getKiwiAugment(id, augmentMap)?.nameCn || `海克斯强化 #${id}`"
              loading="lazy"
            />
          </span>
          <span class="col-num" :title="`击杀 ${p.kills}`">{{ p.kills }}</span>
          <span class="col-num" :title="`伤害 ${fmt(p.totalDamageDealtToChampions)}`">
            {{ fmt(p.totalDamageDealtToChampions) }}
          </span>
          <span class="col-num" :title="`承伤 ${fmt(p.totalDamageTaken)}`">
            {{ fmt(p.totalDamageTaken) }}
          </span>
          <span class="col-num" :title="`KDA ${toFixed(p.kda)}`">
            {{ toFixed(p.kda) }}
          </span>
          <span class="col-num" :title="`治疗 ${fmt(p.totalHeal)}`">
            {{ fmt(p.totalHeal) }}
          </span>
          <span class="col-num cs" :title="`补刀 ${p.cs}`">{{ p.cs }}</span>
          <span class="col-kp" :title="`参团率 ${toFixed(p.killParticipation * 100)}%`">
            {{ toFixed(p.killParticipation * 100) }}%
          </span>
          <span class="col-gold" :title="`经济 ${fmt(p.goldEarned)}`">
            {{ fmt(p.goldEarned) }}
          </span>
          <span class="col-vision" :title="`视野 ${toFixed(p.visionScore ?? 0)}`">
            {{ toFixed(p.visionScore ?? 0) }}
          </span>
          <span class="col-level" :title="`等级 ${p.level}`">{{ p.level }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MatchParticipant } from '@/utils/match-history/adapter';
import { toFixed } from '@/utils/match-history/format';
import {
  getChampionAlias,
  getItemIcon,
  getKiwiAugment,
  loadKiwiAugments,
  type ChampionMeta,
  type KiwiAugment
} from '@/utils/match-history/images';
import ChampionAvatar from './champion-avatar.vue';

const props = defineProps<{
  /** 完整对局全员（需详情数据） */
  participants: MatchParticipant[];
  championMap: Map<number, ChampionMeta>;
  /** 高亮当前查看的玩家 */
  highlightPuuid?: string;
}>();

const fmt = (v: number): string => {
  if (v >= 10000) {
    return `${toFixed(v / 10000)}w`;
  }
  if (v >= 1000) {
    return `${toFixed(v / 1000)}k`;
  }
  return String(v);
};

const teams = computed(() => {
  const me = props.participants.find((p) => p.puuid === props.highlightPuuid);
  if (!me) {
    return [];
  }
  const myTeam = props.participants.filter((p) => p.teamIdentifier === me.teamIdentifier);
  const enemies = props.participants.filter((p) => p.teamIdentifier !== me.teamIdentifier);
  return [
    {
      title: '己方队友',
      win: myTeam.some((p) => p.winResult === 'win'),
      players: myTeam
    },
    {
      title: '对手',
      win: enemies.some((p) => p.winResult === 'win'),
      players: enemies
    }
  ];
});

// ===== 海克斯强化 =====
const augmentMap = ref<Map<number, KiwiAugment>>(new Map());

onMounted(async () => {
  augmentMap.value = await loadKiwiAugments();
});

/** 是否包含海克斯强化（无强化时隐藏整列） */
const hasAugments = computed(() =>
  props.participants.some((p) => (p.augments || []).some((id) => id && id !== 0))
);

const playerAugments = (p: MatchParticipant): number[] =>
  (p.augments || []).filter((id) => id && id !== 0);

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
</script>

<style scoped lang="less">
  .mh-team-table {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;

    .team-block {
      .team-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;

        .team-title {
          font-size: 13px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .team-result {
          font-size: 12px;

          &.win {
            color: #3b82f6;
          }
          &.loss {
            color: #ef4444;
          }
        }
      }

      .team-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 6px;
        background: #1b1f2a;

        &.team-head {
          background: transparent;
          padding: 2px 8px;
          margin-bottom: 2px;
        }

        &.is-me {
          background: #202638;
          outline: 1px solid rgba(96, 165, 250, 0.5);
        }

        // 列宽（表头与数据共用，保证对齐）
        .col-champ {
          width: 30px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .col-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #cbd5e1;
          font-size: 12px;
        }

        .col-items {
          width: 106px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 2px;
          overflow: hidden;

          .item-icon {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            object-fit: cover;
            display: block;
          }
        }

        .col-augments {
          width: 76px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 2px;

          .augment-icon {
            width: 18px;
            height: 18px;
            border-radius: 3px;
            object-fit: cover;
            display: block;
            box-sizing: border-box;
            background: #10131c;

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

        .col-num {
          width: 42px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          color: #94a3b8;
          font-size: 12px;

          &.cs {
            width: 38px;
          }
        }

        .col-kp {
          width: 48px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          color: #94a3b8;
          font-size: 12px;
        }

        .col-gold {
          width: 48px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          color: #94a3b8;
          font-size: 12px;
        }

        .col-vision {
          width: 40px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          color: #94a3b8;
          font-size: 12px;
        }

        .col-level {
          width: 32px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          color: #94a3b8;
          font-size: 12px;
        }

        // 表头单元格
        .th {
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          white-space: nowrap;
        }
      }
    }
  }
</style>
