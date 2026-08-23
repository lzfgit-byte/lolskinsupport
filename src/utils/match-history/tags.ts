/**
 * 战绩卡评级标签计算
 *
 * 迁移自 League Akari（src/renderer-shared/components/match-card/utils/tags.tsx），
 * 精简为 LCU 数据源可用的维度（多杀/伤害/承伤/治疗/塔伤/经济）。
 * LCU 不提供单杀/护盾数据，故不计算这两类标签。
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
}

/** 全场汇总统计（用于计算"全场最高"类评级） */
export interface AllTeamStats {
  maxDamageDealtToChampions: number;
  maxDamageTaken: number;
  maxHeal: number;
  maxDamageToTowers: number;
  maxGoldEarned: number;
}

export interface PlayerTag {
  label: string;
  /** 对应组件里的配色类名后缀，如 rose/slate/emerald/stone/gold */
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
    maxGoldEarned: 0
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
  }

  const allTeamStats: AllTeamStats = {
    maxDamageDealtToChampions: 0,
    maxDamageTaken: 0,
    maxHeal: 0,
    maxDamageToTowers: 0,
    maxGoldEarned: 0
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
      label: '全场最高伤害',
      color: 'red',
      content: `全场伤害 ${participant.totalDamageDealtToChampions.toLocaleString()} · 团队占比 ${rate}%`,
      priority: 1800
    });
  } else if (participant.totalDamageDealtToChampions === team.maxDamageDealtToChampions) {
    tags.push({
      label: '团队伤害最高',
      color: 'red',
      content: `伤害 ${participant.totalDamageDealtToChampions.toLocaleString()} · 团队占比 ${rate}%`,
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
      label: '全场承伤最高',
      color: 'slate',
      content: `全场承伤 ${participant.totalDamageTaken.toLocaleString()} · 团队占比 ${rate}%`,
      priority: 1400
    });
  } else if (participant.totalDamageTaken === team.maxDamageTaken) {
    tags.push({
      label: '团队承伤最高',
      color: 'slate',
      content: `承伤 ${participant.totalDamageTaken.toLocaleString()} · 团队占比 ${rate}%`,
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
      label: '全场治疗最高',
      color: 'emerald',
      content: `全场治疗 ${participant.totalHeal.toLocaleString()} · 团队占比 ${rate}%`,
      priority: 1600
    });
  } else if (participant.totalHeal === team.maxHeal) {
    tags.push({
      label: '团队治疗最高',
      color: 'emerald',
      content: `治疗 ${participant.totalHeal.toLocaleString()} · 团队占比 ${rate}%`,
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
      label: '全场推塔最高',
      color: 'stone',
      content: `全场塔伤 ${participant.totalDamageToTowers.toLocaleString()} · 团队占比 ${rate}%`,
      priority: 900
    });
  } else if (participant.totalDamageToTowers === team.maxDamageToTowers) {
    tags.push({
      label: '团队推塔最高',
      color: 'stone',
      content: `塔伤 ${participant.totalDamageToTowers.toLocaleString()} · 团队占比 ${rate}%`,
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
      label: '全场经济最高',
      color: 'gold',
      content: `全场经济 ${participant.goldEarned.toLocaleString()} · 团队占比 ${rate}%`,
      priority: 1200
    });
  } else if (participant.goldEarned === team.maxGoldEarned) {
    tags.push({
      label: '团队经济最高',
      color: 'gold',
      content: `经济 ${participant.goldEarned.toLocaleString()} · 团队占比 ${rate}%`,
      priority: 1150
    });
  }
}

/**
 * 计算某个选手在一局中的评级标签（按 priority 从高到低排序）
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

  return tags.sort((a, b) => b.priority - a.priority);
}
