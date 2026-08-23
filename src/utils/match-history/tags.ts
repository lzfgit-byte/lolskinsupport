/**
 * 战绩卡评级标签计算
 *
 * 迁移自 League Akari（src/renderer-shared/components/match-card/utils/tags.tsx），
 * 文案与其 zh-CN 一致（best 标签带 ★）。LCU 数据源不提供单杀/护盾等数据，故跳过。
 * 注意：计算"最高"类标签需要完整对局数据（含全员），应使用对局详情。
 */
import type { MatchParticipant } from './adapter';

/** 单个队伍汇总统计（用于计算"最高/占比"类评级） */
export interface TeamStats {
  totalDamageDealtToChampions: number;
  maxDamageDealtToChampions: number;
  totalDamageTaken: number;
  maxDamageTaken: number;
  totalHeal: number;
  maxHeal: number;
  totalDamageToTowers: number;
  maxDamageToTowers: number;
  totalGoldEarned: number;
  maxGoldEarned: number;
  totalKills: number;
  maxKills: number;
  maxKillParticipation: number;
  maxCs: number;
  maxTimeCCingOthers: number;
}

/** 全场汇总统计（用于计算"全场最高"类评级） */
export interface AllTeamStats {
  maxDamageDealtToChampions: number;
  maxDamageTaken: number;
  maxHeal: number;
  maxDamageToTowers: number;
  maxGoldEarned: number;
  maxKills: number;
  maxCs: number;
  maxKillParticipation: number;
  maxTimeCCingOthers: number;
}

export interface PlayerTag {
  label: string;
  /** 对应组件里的配色类名后缀，如 rose/slate/emerald/stone/gold/violet/cyan/orange/fuchsia */
  color: string;
  /** 悬停提示内容 */
  content?: string;
  priority: number;
}

function emptyTeamStats(): TeamStats {
  return {
    totalDamageDealtToChampions: 0,
    maxDamageDealtToChampions: 0,
    totalDamageTaken: 0,
    maxDamageTaken: 0,
    totalHeal: 0,
    maxHeal: 0,
    totalDamageToTowers: 0,
    maxDamageToTowers: 0,
    totalGoldEarned: 0,
    maxGoldEarned: 0,
    totalKills: 0,
    maxKills: 0,
    maxKillParticipation: 0,
    maxCs: 0,
    maxTimeCCingOthers: 0
  };
}

/** 按队伍聚合统计数据 */
export function computeTeamStatsMap(participants: MatchParticipant[]): {
  teams: Record<string, TeamStats>;
  allTeamStats: AllTeamStats;
} {
  const teams: Record<string, TeamStats> = {};

  for (const p of participants) {
    if (!teams[p.teamIdentifier]) {
      teams[p.teamIdentifier] = emptyTeamStats();
    }
    const t = teams[p.teamIdentifier];
    t.totalDamageDealtToChampions += p.totalDamageDealtToChampions;
    t.maxDamageDealtToChampions = Math.max(t.maxDamageDealtToChampions, p.totalDamageDealtToChampions);
    t.totalDamageTaken += p.totalDamageTaken;
    t.maxDamageTaken = Math.max(t.maxDamageTaken, p.totalDamageTaken);
    t.totalHeal += p.totalHeal;
    t.maxHeal = Math.max(t.maxHeal, p.totalHeal);
    t.totalDamageToTowers += p.totalDamageToTowers;
    t.maxDamageToTowers = Math.max(t.maxDamageToTowers, p.totalDamageToTowers);
    t.totalGoldEarned += p.goldEarned;
    t.maxGoldEarned = Math.max(t.maxGoldEarned, p.goldEarned);
    t.totalKills += p.kills;
    t.maxKills = Math.max(t.maxKills, p.kills);
    t.maxKillParticipation = Math.max(t.maxKillParticipation, p.killParticipation);
    t.maxCs = Math.max(t.maxCs, p.cs);
    t.maxTimeCCingOthers = Math.max(t.maxTimeCCingOthers, p.timeCCingOthers);
  }

  const allTeamStats: AllTeamStats = {
    maxDamageDealtToChampions: 0,
    maxDamageTaken: 0,
    maxHeal: 0,
    maxDamageToTowers: 0,
    maxGoldEarned: 0,
    maxKills: 0,
    maxCs: 0,
    maxKillParticipation: 0,
    maxTimeCCingOthers: 0
  };

  for (const t of Object.values(teams)) {
    allTeamStats.maxDamageDealtToChampions = Math.max(
      allTeamStats.maxDamageDealtToChampions,
      t.maxDamageDealtToChampions
    );
    allTeamStats.maxDamageTaken = Math.max(allTeamStats.maxDamageTaken, t.maxDamageTaken);
    allTeamStats.maxHeal = Math.max(allTeamStats.maxHeal, t.maxHeal);
    allTeamStats.maxDamageToTowers = Math.max(
      allTeamStats.maxDamageToTowers,
      t.maxDamageToTowers
    );
    allTeamStats.maxGoldEarned = Math.max(allTeamStats.maxGoldEarned, t.maxGoldEarned);
    allTeamStats.maxKills = Math.max(allTeamStats.maxKills, t.maxKills);
    allTeamStats.maxCs = Math.max(allTeamStats.maxCs, t.maxCs);
    allTeamStats.maxKillParticipation = Math.max(
      allTeamStats.maxKillParticipation,
      t.maxKillParticipation
    );
    allTeamStats.maxTimeCCingOthers = Math.max(
      allTeamStats.maxTimeCCingOthers,
      t.maxTimeCCingOthers
    );
  }

  return { teams, allTeamStats };
}

function times(label: string, count: number): string {
  if (count === 1) {
    return label;
  }
  return `${label}×${Math.round(count)}`;
}

function pushMultikillTags(tags: PlayerTag[], participant: MatchParticipant): void {
  const streakKills = {
    double: participant.doubleKills,
    triple: participant.tripleKills,
    quadra: participant.quadraKills,
    penta: participant.pentaKills
  };

  // 去掉被更高连杀包含的次数
  streakKills.quadra -= streakKills.penta;
  streakKills.triple -= streakKills.quadra + streakKills.penta;
  streakKills.double -= streakKills.triple + streakKills.quadra + streakKills.penta;

  if (streakKills.penta) {
    tags.push({ label: times('五杀', streakKills.penta), color: 'rose', priority: 20000 });
  }
  if (streakKills.quadra) {
    tags.push({ label: times('四杀', streakKills.quadra), color: 'rose', priority: 1300 });
  }
  if (streakKills.triple) {
    tags.push({
      label: times('三杀', streakKills.triple),
      color: 'rose',
      priority: 300 + streakKills.triple * 15
    });
  }
  if (streakKills.double) {
    tags.push({
      label: times('双杀', streakKills.double),
      color: 'rose',
      priority: 100 + streakKills.double * 10
    });
  }
}

function pushDamageTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  team: TeamStats,
  allTeamStats: AllTeamStats
): void {
  if (!participant.totalDamageDealtToChampions) {
    return;
  }
  const rate = (
    (participant.totalDamageDealtToChampions / (team.totalDamageDealtToChampions || 1)) *
    100
  ).toFixed(1);

  if (participant.totalDamageDealtToChampions === allTeamStats.maxDamageDealtToChampions) {
    tags.push({
      label: '★ 伤害',
      color: 'red',
      content: `全场最高伤害：${participant.totalDamageDealtToChampions.toLocaleString()}，占队伍伤害的 ${rate}%`,
      priority: 1800
    });
  } else if (participant.totalDamageDealtToChampions === team.maxDamageDealtToChampions) {
    tags.push({
      label: '伤害',
      color: 'red',
      content: `队伍最高伤害：${participant.totalDamageDealtToChampions.toLocaleString()}，占队伍伤害的 ${rate}%`,
      priority: 1750
    });
  }
}

function pushTakenTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  team: TeamStats,
  allTeamStats: AllTeamStats
): void {
  if (!participant.totalDamageTaken) {
    return;
  }
  const rate = ((participant.totalDamageTaken / (team.totalDamageTaken || 1)) * 100).toFixed(1);

  if (participant.totalDamageTaken === allTeamStats.maxDamageTaken) {
    tags.push({
      label: '★ 承伤',
      color: 'slate',
      content: `全场最高承伤：${participant.totalDamageTaken.toLocaleString()}，占队伍承伤的 ${rate}%`,
      priority: 1400
    });
  } else if (participant.totalDamageTaken === team.maxDamageTaken) {
    tags.push({
      label: '承伤',
      color: 'slate',
      content: `队伍最高承伤：${participant.totalDamageTaken.toLocaleString()}，占队伍承伤的 ${rate}%`,
      priority: 1350
    });
  }
}

function pushHealTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  team: TeamStats,
  allTeamStats: AllTeamStats
): void {
  if (!participant.totalHeal) {
    return;
  }
  const rate = ((participant.totalHeal / (team.totalHeal || 1)) * 100).toFixed(1);

  if (participant.totalHeal === allTeamStats.maxHeal) {
    tags.push({
      label: '★ 治疗',
      color: 'emerald',
      content: `全场最高治疗：${participant.totalHeal.toLocaleString()}，占队伍治疗的 ${rate}%`,
      priority: 1600
    });
  } else if (participant.totalHeal === team.maxHeal) {
    tags.push({
      label: '治疗',
      color: 'emerald',
      content: `队伍最高治疗：${participant.totalHeal.toLocaleString()}，占队伍治疗的 ${rate}%`,
      priority: 1550
    });
  }
}

function pushTowerTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  team: TeamStats,
  allTeamStats: AllTeamStats
): void {
  if (!participant.totalDamageToTowers) {
    return;
  }
  const rate = ((participant.totalDamageToTowers / (team.totalDamageToTowers || 1)) * 100).toFixed(1);

  if (participant.totalDamageToTowers === allTeamStats.maxDamageToTowers) {
    tags.push({
      label: '★ 拆塔',
      color: 'stone',
      content: `全场最高对塔伤害：${participant.totalDamageToTowers.toLocaleString()}，占队伍对塔伤害的 ${rate}%`,
      priority: 900
    });
  } else if (participant.totalDamageToTowers === team.maxDamageToTowers) {
    tags.push({
      label: '拆塔',
      color: 'stone',
      content: `队伍最高对塔伤害：${participant.totalDamageToTowers.toLocaleString()}，占队伍对塔伤害的 ${rate}%`,
      priority: 850
    });
  }
}

function pushGoldTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  team: TeamStats,
  allTeamStats: AllTeamStats
): void {
  if (!participant.goldEarned) {
    return;
  }
  const rate = ((participant.goldEarned / (team.totalGoldEarned || 1)) * 100).toFixed(1);

  if (participant.goldEarned === allTeamStats.maxGoldEarned) {
    tags.push({
      label: '★ 金币',
      color: 'gold',
      content: `全场最高经济：${participant.goldEarned.toLocaleString()}，占队伍经济的 ${rate}%`,
      priority: 700
    });
  } else if (participant.goldEarned === team.maxGoldEarned) {
    tags.push({
      label: '金币',
      color: 'gold',
      content: `队伍最高经济：${participant.goldEarned.toLocaleString()}，占队伍经济的 ${rate}%`,
      priority: 650
    });
  }
}

function pushKillsTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  team: TeamStats,
  allTeamStats: AllTeamStats
): void {
  if (!participant.kills) {
    return;
  }
  if (participant.kills === allTeamStats.maxKills) {
    tags.push({
      label: '★ 击杀',
      color: 'violet',
      content: `全场最多击杀：${participant.kills.toLocaleString()}`,
      priority: 1200
    });
  } else if (participant.kills === team.maxKills) {
    tags.push({
      label: '击杀',
      color: 'violet',
      content: `队伍最多击杀：${participant.kills.toLocaleString()}`,
      priority: 1150
    });
  }
}

function pushKpTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  team: TeamStats,
  allTeamStats: AllTeamStats
): void {
  if (!participant.killParticipation) {
    return;
  }
  if (participant.killParticipation === allTeamStats.maxKillParticipation) {
    tags.push({
      label: '★ 参团',
      color: 'cyan',
      content: `全场最高参团率：${(participant.killParticipation * 100).toFixed(1)}%`,
      priority: 1100
    });
  } else if (participant.killParticipation === team.maxKillParticipation) {
    tags.push({
      label: '参团',
      color: 'cyan',
      content: `队伍最高参团率：${(participant.killParticipation * 100).toFixed(1)}%`,
      priority: 1050
    });
  }
}

function pushCsTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  allTeamStats: AllTeamStats
): void {
  if (participant.cs && participant.cs === allTeamStats.maxCs) {
    tags.push({
      label: '★ 补兵',
      color: 'orange',
      content: `全场最高补兵：${participant.cs.toLocaleString()}`,
      priority: 600
    });
  }
}

function pushCcTags(
  tags: PlayerTag[],
  participant: MatchParticipant,
  team: TeamStats,
  allTeamStats: AllTeamStats
): void {
  if (!participant.timeCCingOthers) {
    return;
  }
  if (participant.timeCCingOthers === allTeamStats.maxTimeCCingOthers) {
    tags.push({
      label: '★ 控制',
      color: 'fuchsia',
      content: `全场最久控制，控制了敌方英雄 ${participant.timeCCingOthers.toLocaleString()} 秒`,
      priority: 1750
    });
  } else if (participant.timeCCingOthers === team.maxTimeCCingOthers) {
    tags.push({
      label: '控制',
      color: 'fuchsia',
      content: `队伍最久控制，控制了敌方英雄 ${participant.timeCCingOthers.toLocaleString()} 秒`,
      priority: 1700
    });
  }
}

/**
 * 计算某个选手在一局中的评级标签（按 priority 从高到低排序）。
 * 注意：传入的 participants 应为完整对局（含全员），否则"最高"类标签会失真。
 */
export function computeMatchTags(
  participant: MatchParticipant,
  participants: MatchParticipant[]
): PlayerTag[] {
  const { teams, allTeamStats } = computeTeamStatsMap(participants);
  const team = teams[participant.teamIdentifier];

  const tags: PlayerTag[] = [];
  pushMultikillTags(tags, participant);
  pushDamageTags(tags, participant, team, allTeamStats);
  pushTakenTags(tags, participant, team, allTeamStats);
  pushHealTags(tags, participant, team, allTeamStats);
  pushTowerTags(tags, participant, team, allTeamStats);
  pushGoldTags(tags, participant, team, allTeamStats);
  pushKillsTags(tags, participant, team, allTeamStats);
  pushKpTags(tags, participant, team, allTeamStats);
  pushCsTags(tags, participant, allTeamStats);
  pushCcTags(tags, participant, team, allTeamStats);

  return tags.sort((a, b) => b.priority - a.priority);
}

