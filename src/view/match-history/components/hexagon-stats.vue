<template>
  <div class="hexagon-stats" :class="{ 'is-ready': ready }" :title="tooltipText">
    <svg :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size" class="hex-svg">
      <!-- 网格环 -->
      <polygon
        v-for="ring in rings"
        :key="ring"
        :points="hexPoints(ring)"
        class="hex-ring"
        fill="none"
      />
      <!-- 轴线 -->
      <line
        v-for="(s, i) in axes"
        :key="s.key"
        :x1="cx"
        :y1="cy"
        :x2="vertex(i, 1).x"
        :y2="vertex(i, 1).y"
        class="hex-axis"
      />
      <!-- 当前用户数据多边形 -->
      <polygon :points="userHexPoints" class="hex-user" />
      <!-- 用户顶点圆点 -->
      <circle
        v-for="(s, i) in axes"
        :key="s.key"
        :cx="userVertex(i).x"
        :cy="userVertex(i).y"
        r="2.4"
        class="hex-dot"
      />
      <!-- 轴标签 -->
      <text
        v-for="(s, i) in axes"
        :key="s.key"
        :x="vertex(i, labelScale).x"
        :y="vertex(i, labelScale).y"
        class="hex-label"
        text-anchor="middle"
      >
        {{ s.label }}
      </text>
    </svg>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import type { MatchParticipant } from '@/utils/match-history/adapter';

  const props = defineProps<{
    participant: MatchParticipant | null;
    team: MatchParticipant[];
    /** 是否已加载完整对局（详情），未加载时仅显示网格占位 */
    ready?: boolean;
  }>();

  const size = 150;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 56;
  const labelScale = 1.15;

  const axes = [
    { key: 'kills', label: '击杀' },
    { key: 'damage', label: '伤害' },
    { key: 'taken', label: '承伤' },
    { key: 'assists', label: '助攻' },
    { key: 'heal', label: '治疗' },
    { key: 'cs', label: '补刀' },
  ];

  const getValue = (p: MatchParticipant, key: string): number => {
    switch (key) {
      case 'kills':
        return p.kills;
      case 'damage':
        return p.totalDamageDealtToChampions;
      case 'taken':
        return p.totalDamageTaken;
      case 'assists':
        return p.assists;
      case 'heal':
        return p.totalHeal;
      case 'cs':
        return p.cs;
      default:
        return 0;
    }
  };

  /** 队伍中每项统计的最高值（六极） */
  const teamMax = computed(() => {
    const m: Record<string, number> = {};
    for (const a of axes) {
      m[a.key] = props.team.reduce((acc, p) => Math.max(acc, getValue(p, a.key)), 0);
    }
    return m;
  });

  /** 当前用户每项相对队内最高值的比例（0-1） */
  const ratios = computed(() => {
    const r: Record<string, number> = {};
    const p = props.participant;
    if (!p || !props.ready) {
      for (const a of axes) {
        r[a.key] = 0;
      }
      return r;
    }
    for (const a of axes) {
      const max = teamMax.value[a.key];
      r[a.key] = max > 0 ? Math.min(1, getValue(p, a.key) / max) : 0;
    }
    return r;
  });

  const angle = (i: number) => (-90 + i * 60) * (Math.PI / 180);

  const vertex = (i: number, scale: number) => ({
    x: cx + Math.cos(angle(i)) * radius * scale,
    y: cy + Math.sin(angle(i)) * radius * scale,
  });

  const rings = [0.33, 0.66, 1];

  const hexPoints = (scale: number) =>
    axes.map((_, i) => `${vertex(i, scale).x},${vertex(i, scale).y}`).join(' ');

  const userHexPoints = computed(() =>
    axes.map((_, i) => `${userVertex(i).x},${userVertex(i).y}`).join(' ')
  );

  const userVertex = (i: number) => vertex(i, ratios.value[axes[i].key]);

  const tooltipText = computed(() => {
    if (!props.participant || !props.ready) {
      return '';
    }
    return axes
      .map((a) => {
        const max = teamMax.value[a.key];
        const val = getValue(props.participant!, a.key);
        return `${a.label}：${val.toLocaleString()} / 队内最高 ${max.toLocaleString()}`;
      })
      .join('\n');
  });
</script>

<style scoped lang="less">
  .hexagon-stats {
    flex-shrink: 0;

    .hex-svg {
      display: block;
    }

    .hex-ring {
      stroke: rgba(255, 255, 255, 0.12);
      stroke-width: 1;
    }

    .hex-axis {
      stroke: rgba(255, 255, 255, 0.08);
      stroke-width: 1;
    }

    .hex-user {
      fill: rgba(96, 165, 250, 0.22);
      stroke: #60a5fa;
      stroke-width: 1.5;
    }

    .hex-dot {
      fill: #60a5fa;
    }

    .hex-label {
      fill: #94a3b8;
      font-size: 12px;
      font-weight: 500;
    }

    &.is-ready {
      .hex-user {
        transition: fill 0.2s;
      }
    }
  }
</style>
