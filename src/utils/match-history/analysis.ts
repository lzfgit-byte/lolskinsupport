/**
 * 战绩分析引擎（Akari Score 等）
 *
 * 迁移自 League Akari：
 * - src/shared/data-adapter/analysis/player/index.ts
 * - src/shared/data-adapter/analysis/player/scoring.ts
 * - src/shared/data-adapter/analysis/player/single/summary.ts
 * - src/shared/data-adapter/analysis/player/single/akari.ts
 * - src/shared/data-adapter/analysis/player/aggregate/summary.ts
 * - src/shared/data-adapter/analysis/player/aggregate/akari.ts
 *
 * 仅保留 LCU 数据源可用的分析维度（去除打野/时间线/目标等需要详情的部分）。
 */
import { MatchBasicInfo, MatchParticipant, toBasicInfo, toParticipants } from './adapter';
import {
  AGGREGATE_AKARI_EXTRAORDINARY_MIN_COUNT,
  AGGREGATE_AKARI_EXTRAORDINARY_THRESHOLD,
  AGGREGATE_AKARI_OUTSTANDING_MIN_COUNT,
  AGGREGATE_AKARI_OUTSTANDING_THRESHOLD,
  AKARI_CS_FULL_SCORE_PER_MINUTE,
  AKARI_CS_MAX_SCORE,
  AKARI_CS_MIN_SCORE_PER_MINUTE,
  AKARI_DAMAGE_TAKEN_WEIGHT,
  AKARI_DAMAGE_WEIGHT,
  AKARI_EXPECTED_CONTRIBUTION_BASELINE_RATIO,
  AKARI_GOLD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
  AKARI_GOLD_WEIGHT,
  AKARI_HEALING_FULL_SCORE_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO,
  AKARI_HEALING_MAX_SCORE,
  AKARI_HEALING_MIN_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO,
  AKARI_HEALING_SOLO_FULL_SCORE_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO,
  AKARI_KDA_BASELINE,
  AKARI_KDA_MAX_SCORE,
  AKARI_KDA_WEIGHT,
  AKARI_MAX_SCORE,
  AKARI_PARTICIPATION_MIN_SHARE,
  AKARI_PARTICIPATION_WEIGHT,
  AKARI_STANDARD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
  AKARI_VISION_MAX_SCORE,
  AKARI_WIN_RATE_BASELINE,
  AKARI_WIN_RATE_WEIGHT,
  avgOrZero,
  calculateCoefficientOfVariation,
  noZero
} from './constants';
import type { Game } from './types';

// ---------------- PVE / 非匹配对局过滤 ----------------

const pveQueues = new Set([
  31, 32, 33, 34, 35, 36, 52, 800, 801, 810, 820, 830, 831, 832, 840, 841, 842, 850, 851, 852, 860,
  870, 880, 890, 2000, 2010, 2020,
  90, 91, 92, 950, 951, 960, 961,
  981, 982, 990,
  1030, 1031, 1032, 1040, 1041, 1050, 1051, 1060, 1061, 1070, 1071,
  1800, 1810, 1820, 1830, 1840, 1850, 1860, 1870, 1880, 1890
]);

export function isPveQueue(queueId: number): boolean {
  if (typeof queueId === 'string') {
    return pveQueues.has(Number(queueId));
  }
  return pveQueues.has(queueId);
}

// ---------------- 评分函数 ----------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(Math.min(value, max), min);
}

function scoreLinearRange(value: number, min: number, max: number, maxScore: number): number {
  return ((clamp(value, min, max) - min) / (max - min)) * maxScore;
}

export function scoreExpectedContribution(
  ratio: number,
  fullScoreRatio: number,
  maxScore: number
): number {
  return scoreLinearRange(
    ratio,
    AKARI_EXPECTED_CONTRIBUTION_BASELINE_RATIO,
    fullScoreRatio,
    maxScore
  );
}

export function scoreKda(kda: number): number {
  const effectiveKda = Math.max(kda - AKARI_KDA_BASELINE, 0);
  return clamp(Math.sqrt(effectiveKda) * AKARI_KDA_WEIGHT, 0, AKARI_KDA_MAX_SCORE);
}

export function scoreHealing(
  healingRatioToTeamAverageDamageTaken: number,
  teamParticipantCount: number
): number {
  const fullScoreRatio =
    teamParticipantCount === 1
      ? AKARI_HEALING_SOLO_FULL_SCORE_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO
      : AKARI_HEALING_FULL_SCORE_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO;

  return scoreLinearRange(
    healingRatioToTeamAverageDamageTaken,
    AKARI_HEALING_MIN_TEAM_AVERAGE_DAMAGE_TAKEN_RATIO,
    fullScoreRatio,
    AKARI_HEALING_MAX_SCORE
  );
}

export function scoreWinRate(winRate: number): number {
  return scoreLinearRange(winRate, AKARI_WIN_RATE_BASELINE, 1, AKARI_WIN_RATE_WEIGHT);
}

export function scoreCsPerMinute(csPerMinute: number): number {
  return scoreLinearRange(
    csPerMinute,
    AKARI_CS_MIN_SCORE_PER_MINUTE,
    AKARI_CS_FULL_SCORE_PER_MINUTE,
    AKARI_CS_MAX_SCORE
  );
}

export function scoreParticipation(killParticipation: number): number {
  return scoreLinearRange(
    killParticipation,
    AKARI_PARTICIPATION_MIN_SHARE,
    1,
    AKARI_PARTICIPATION_WEIGHT
  );
}

// ---------------- 类型 ----------------

export interface AkariScore {
  kdaScore: number;
  winRateScore: number;
  dmgScore: number;
  dmgTakenScore: number;
  healingScore: number;
  csScore: number;
  goldScore: number;
  participationScore: number;
  visionScore: number;
  total: number;
  maxScore: number;
  outstanding: boolean;
  extraordinary: boolean;
}

export interface SingleSummaryAnalysis {
  championDamageRatioToTeamMax: number;
  championDamageRatioToExpectedContribution: number;
  championDamageRatioToMax: number;
  championDamagePercentageOfTeam: number;
  championDamagePerMinute: number;
  damageTakenRatioToTeamMax: number;
  damageTakenRatioToExpectedContribution: number;
  damageTakenRatioToMax: number;
  damageTakenPercentageOfTeam: number;
  healingRatioToTeamAverageDamageTaken: number;
  teamParticipantCount: number;
  goldRatioToTeamMax: number;
  goldRatioToExpectedContribution: number;
  goldRatioToMax: number;
  goldPercentageOfTeam: number;
  csRatioToTeamMax: number;
  csRatioToMax: number;
  csPercentageOfTeam: number;
  csPerMinute: number;
  towerDamageRatioToTeamMax: number;
  towerDamageRatioToMax: number;
  towerDamagePercentageOfTeam: number;
  visionScorePercentageOfTeam: number;
  visionScoreRatioToExpectedContribution: number;
  totalDamageShieldedOnTeammatesRatioToTeamMax: number | null;
  totalDamageShieldedOnTeammatesRatioToMax: number | null;
  totalDamageShieldedOnTeammatesPercentageOfTeam: number | null;
  killDamageEfficiency: number;
  kda: number;
  win: boolean;
  killParticipation: number;
  damageGoldEfficiency: number;
}

export interface SingleAnalysis {
  gameId: number;
  summary: SingleSummaryAnalysis;
  akariScore: AkariScore;
}

export interface AggregatedSummaryAnalysis {
  avgChampionDamageRatioToTeamMax: number;
  avgChampionDamageRatioToMax: number;
  avgChampionDamagePercentageOfTeam: number;
  avgChampionDamagePerMinute: number;
  avgDamageTakenRatioToTeamMax: number;
  avgDamageTakenRatioToMax: number;
  avgDamageTakenPercentageOfTeam: number;
  avgGoldRatioToTeamMax: number;
  avgGoldRatioToMax: number;
  avgGoldPercentageOfTeam: number;
  avgCsRatioToTeamMax: number;
  avgCsRatioToMax: number;
  avgCsPercentageOfTeam: number;
  avgCsPerMinute: number;
  avgTowerDamageRatioToTeamMax: number;
  avgTowerDamageRatioToMax: number;
  avgTowerDamagePercentageOfTeam: number;
  avgVisionScore: number;
  avgVisionScorePercentageOfTeam: number;
  avgDamageGoldEfficiency: number;
  avgKillParticipation: number;
  kills: number;
  deaths: number;
  assists: number;
  avgKda: number;
  kdaCv: number;
  winRate: number;
  // LCU 数据源不提供以下字段，统一置 null
  avgSoloKills: number | null;
  avgEnemyMissingPings: number | null;
  avgPings: number | null;
}

export interface AggregatedAnalysis {
  count: number;
  summary: AggregatedSummaryAnalysis;
  akariScore: AkariScore;
  map: Record<number, SingleAnalysis>;
  detailsCount: number;
}

export interface AnalyzeGamesOptions {
  /** 是否过滤PVE和非匹配游戏，默认过滤 */
  filterPveAndNonMatchedGames?: boolean;

  /** 是否过滤掉已取消或重开的游戏，默认过滤 */
  filterAbortedOrRemadeGames?: boolean;
}

interface PreparedGame {
  gameId: number;
  basic: MatchBasicInfo;
  participant: MatchParticipant;
  participants: MatchParticipant[];
  single: SingleAnalysis;
}

// ---------------- 单局分析 ----------------

export function computeSingleSummary(
  basic: MatchBasicInfo,
  participant: MatchParticipant,
  teamParticipants: MatchParticipant[],
  allParticipants: MatchParticipant[]
): SingleSummaryAnalysis {
  const getVisionScore = (p: MatchParticipant) => p.visionScore ?? 0;
  const getExpectedContributionRatio = (value: number, total: number) => {
    if (teamParticipants.length <= 1) {
      return 0;
    }
    return value / noZero(total) / (1 / teamParticipants.length);
  };

  const teamMaxChampionDmg = Math.max(...teamParticipants.map((p) => p.totalDamageDealtToChampions));
  const teamMaxDmgTaken = Math.max(...teamParticipants.map((p) => p.totalDamageTaken));
  const teamMaxGold = Math.max(...teamParticipants.map((p) => p.goldEarned));
  const teamMaxCs = Math.max(...teamParticipants.map((p) => p.cs));
  const teamMaxTowerDmg = Math.max(...teamParticipants.map((p) => p.totalDamageToTowers));
  const teamTotalChampionDmg = teamParticipants.reduce(
    (acc, p) => acc + p.totalDamageDealtToChampions,
    0
  );
  const teamTotalDmgTaken = teamParticipants.reduce((acc, p) => acc + p.totalDamageTaken, 0);
  const teamAverageDmgTaken = teamTotalDmgTaken / noZero(teamParticipants.length);
  const teamTotalGold = teamParticipants.reduce((acc, p) => acc + p.goldEarned, 0);
  const teamTotalCs = teamParticipants.reduce((acc, p) => acc + p.cs, 0);
  const teamTotalTowerDmg = teamParticipants.reduce((acc, p) => acc + p.totalDamageToTowers, 0);
  const teamTotalVisionScore = teamParticipants.reduce((acc, p) => acc + getVisionScore(p), 0);
  const teamTotalKills = teamParticipants.reduce((acc, p) => acc + p.kills, 0);

  const maxChampionDmg = Math.max(...allParticipants.map((p) => p.totalDamageDealtToChampions));
  const maxDmgTaken = Math.max(...allParticipants.map((p) => p.totalDamageTaken));
  const maxGold = Math.max(...allParticipants.map((p) => p.goldEarned));
  const maxCs = Math.max(...allParticipants.map((p) => p.cs));
  const maxTowerDmg = Math.max(...allParticipants.map((p) => p.totalDamageToTowers));

  const durationMinutes = noZero(basic.gameDuration / 60);

  return {
    championDamageRatioToTeamMax:
      participant.totalDamageDealtToChampions / noZero(teamMaxChampionDmg),
    championDamageRatioToExpectedContribution: getExpectedContributionRatio(
      participant.totalDamageDealtToChampions,
      teamTotalChampionDmg
    ),
    championDamageRatioToMax: participant.totalDamageDealtToChampions / noZero(maxChampionDmg),
    championDamagePercentageOfTeam:
      participant.totalDamageDealtToChampions / noZero(teamTotalChampionDmg),
    championDamagePerMinute: participant.totalDamageDealtToChampions / durationMinutes,
    damageTakenRatioToTeamMax: participant.totalDamageTaken / noZero(teamMaxDmgTaken),
    damageTakenRatioToExpectedContribution: getExpectedContributionRatio(
      participant.totalDamageTaken,
      teamTotalDmgTaken
    ),
    damageTakenRatioToMax: participant.totalDamageTaken / noZero(maxDmgTaken),
    damageTakenPercentageOfTeam: participant.totalDamageTaken / noZero(teamTotalDmgTaken),
    healingRatioToTeamAverageDamageTaken: participant.totalHeal / noZero(teamAverageDmgTaken),
    teamParticipantCount: teamParticipants.length,
    goldRatioToTeamMax: participant.goldEarned / noZero(teamMaxGold),
    goldRatioToExpectedContribution: getExpectedContributionRatio(
      participant.goldEarned,
      teamTotalGold
    ),
    goldRatioToMax: participant.goldEarned / noZero(maxGold),
    goldPercentageOfTeam: participant.goldEarned / noZero(teamTotalGold),
    csRatioToTeamMax: participant.cs / noZero(teamMaxCs),
    csRatioToMax: participant.cs / noZero(maxCs),
    csPercentageOfTeam: participant.cs / noZero(teamTotalCs),
    csPerMinute: participant.cs / durationMinutes,
    towerDamageRatioToTeamMax: participant.totalDamageToTowers / noZero(teamMaxTowerDmg),
    towerDamageRatioToMax: participant.totalDamageToTowers / noZero(maxTowerDmg),
    towerDamagePercentageOfTeam: participant.totalDamageToTowers / noZero(teamTotalTowerDmg),
    visionScorePercentageOfTeam: getVisionScore(participant) / noZero(teamTotalVisionScore),
    visionScoreRatioToExpectedContribution: getExpectedContributionRatio(
      getVisionScore(participant),
      teamTotalVisionScore
    ),
    totalDamageShieldedOnTeammatesRatioToTeamMax: null,
    totalDamageShieldedOnTeammatesRatioToMax: null,
    totalDamageShieldedOnTeammatesPercentageOfTeam: null,
    kda: participant.kda,
    win: participant.winResult === 'win',
    killParticipation: (participant.kills + participant.assists) / noZero(teamTotalKills),
    damageGoldEfficiency:
      participant.totalDamageDealtToChampions / noZero(participant.goldEarned),
    killDamageEfficiency:
      teamTotalKills === 0 || teamTotalChampionDmg === 0
        ? 1
        : participant.kills /
          teamTotalKills /
          (participant.totalDamageDealtToChampions / noZero(teamTotalChampionDmg))
  };
}

export function computeSingleAkariScore(summary: SingleSummaryAnalysis): AkariScore {
  const kdaScore = scoreKda(summary.kda);
  const winRateScore = scoreWinRate(summary.win ? 1 : 0);
  const dmgScore = scoreExpectedContribution(
    summary.championDamageRatioToExpectedContribution,
    AKARI_STANDARD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
    AKARI_DAMAGE_WEIGHT
  );
  const dmgTakenScore = scoreExpectedContribution(
    summary.damageTakenRatioToExpectedContribution,
    AKARI_STANDARD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
    AKARI_DAMAGE_TAKEN_WEIGHT
  );
  const healingScore = scoreHealing(
    summary.healingRatioToTeamAverageDamageTaken,
    summary.teamParticipantCount
  );
  const csScore = scoreCsPerMinute(summary.csPerMinute);
  const goldScore = scoreExpectedContribution(
    summary.goldRatioToExpectedContribution,
    AKARI_GOLD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
    AKARI_GOLD_WEIGHT
  );
  const participationScore = scoreParticipation(summary.killParticipation);
  const visionScore = scoreExpectedContribution(
    summary.visionScoreRatioToExpectedContribution,
    AKARI_STANDARD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
    AKARI_VISION_MAX_SCORE
  );

  const total =
    kdaScore +
    winRateScore +
    dmgScore +
    dmgTakenScore +
    healingScore +
    csScore +
    goldScore +
    participationScore +
    visionScore;

  return {
    kdaScore,
    winRateScore,
    dmgScore,
    dmgTakenScore,
    healingScore,
    csScore,
    goldScore,
    participationScore,
    visionScore,
    total,
    maxScore: AKARI_MAX_SCORE,
    outstanding: false,
    extraordinary: false
  };
}

export function analyzeGame(game: Game, puuid: string): SingleAnalysis | null {
  const basic = toBasicInfo(game);
  const participants = toParticipants(game, basic);
  const participant = participants.find((p) => p.puuid === puuid);

  if (!participant) {
    return null;
  }

  const teamParticipants = participants.filter(
    (p) => p.teamIdentifier === participant.teamIdentifier
  );

  const summary = computeSingleSummary(basic, participant, teamParticipants, participants);

  return {
    gameId: game.gameId,
    summary,
    akariScore: computeSingleAkariScore(summary)
  };
}

// ---------------- 聚合分析 ----------------

export function computeAggregatedSummary(games: PreparedGame[]): AggregatedSummaryAnalysis {
  const summaries = games.map((g) => g.single.summary);
  const participants = games.map((g) => g.participant);
  const getVisionScore = (participant: MatchParticipant) => participant.visionScore ?? 0;

  const kills = participants.reduce((s, p) => s + p.kills, 0);
  const deaths = participants.reduce((s, p) => s + p.deaths, 0);
  const assists = participants.reduce((s, p) => s + p.assists, 0);

  return {
    avgChampionDamageRatioToTeamMax: avgOrZero(
      summaries.map((s) => s.championDamageRatioToTeamMax)
    ),
    avgChampionDamageRatioToMax: avgOrZero(summaries.map((s) => s.championDamageRatioToMax)),
    avgChampionDamagePercentageOfTeam: avgOrZero(
      summaries.map((s) => s.championDamagePercentageOfTeam)
    ),
    avgChampionDamagePerMinute: avgOrZero(summaries.map((s) => s.championDamagePerMinute)),
    avgDamageTakenRatioToTeamMax: avgOrZero(summaries.map((s) => s.damageTakenRatioToTeamMax)),
    avgDamageTakenRatioToMax: avgOrZero(summaries.map((s) => s.damageTakenRatioToMax)),
    avgDamageTakenPercentageOfTeam: avgOrZero(
      summaries.map((s) => s.damageTakenPercentageOfTeam)
    ),
    avgGoldRatioToTeamMax: avgOrZero(summaries.map((s) => s.goldRatioToTeamMax)),
    avgGoldRatioToMax: avgOrZero(summaries.map((s) => s.goldRatioToMax)),
    avgGoldPercentageOfTeam: avgOrZero(summaries.map((s) => s.goldPercentageOfTeam)),
    avgCsRatioToTeamMax: avgOrZero(summaries.map((s) => s.csRatioToTeamMax)),
    avgCsRatioToMax: avgOrZero(summaries.map((s) => s.csRatioToMax)),
    avgCsPercentageOfTeam: avgOrZero(summaries.map((s) => s.csPercentageOfTeam)),
    avgCsPerMinute: avgOrZero(summaries.map((s) => s.csPerMinute)),
    avgTowerDamageRatioToTeamMax: avgOrZero(summaries.map((s) => s.towerDamageRatioToTeamMax)),
    avgTowerDamageRatioToMax: avgOrZero(summaries.map((s) => s.towerDamageRatioToMax)),
    avgTowerDamagePercentageOfTeam: avgOrZero(
      summaries.map((s) => s.towerDamagePercentageOfTeam)
    ),
    avgVisionScore: avgOrZero(participants.map(getVisionScore)),
    avgVisionScorePercentageOfTeam: avgOrZero(
      summaries.map((s) => s.visionScorePercentageOfTeam)
    ),
    avgDamageGoldEfficiency: avgOrZero(summaries.map((s) => s.damageGoldEfficiency)),
    avgKillParticipation: avgOrZero(summaries.map((s) => s.killParticipation)),
    kills,
    deaths,
    assists,
    avgKda: (kills + assists) / noZero(deaths),
    kdaCv: calculateCoefficientOfVariation(participants.map((p) => p.kda)),
    winRate: participants.filter((p) => p.winResult === 'win').length / noZero(participants.length),
    avgSoloKills: null,
    avgEnemyMissingPings: null,
    avgPings: null
  };
}

export function computeAggregatedAkariScore(analysis: {
  count: number;
  summary: AggregatedSummaryAnalysis;
  games: PreparedGame[];
}): AkariScore {
  const summaries = analysis.games.map((game) => game.single.summary);
  const kdaScore = scoreKda(analysis.summary.avgKda);
  const winRateScore = scoreWinRate(analysis.summary.winRate);
  const dmgScore = avgOrZero(
    summaries.map((summary) =>
      scoreExpectedContribution(
        summary.championDamageRatioToExpectedContribution,
        AKARI_STANDARD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
        AKARI_DAMAGE_WEIGHT
      )
    )
  );
  const dmgTakenScore = avgOrZero(
    summaries.map((summary) =>
      scoreExpectedContribution(
        summary.damageTakenRatioToExpectedContribution,
        AKARI_STANDARD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
        AKARI_DAMAGE_TAKEN_WEIGHT
      )
    )
  );
  const healingScore = avgOrZero(
    summaries.map((summary) =>
      scoreHealing(summary.healingRatioToTeamAverageDamageTaken, summary.teamParticipantCount)
    )
  );
  const csScore = avgOrZero(summaries.map((summary) => scoreCsPerMinute(summary.csPerMinute)));
  const goldScore = avgOrZero(
    summaries.map((summary) =>
      scoreExpectedContribution(
        summary.goldRatioToExpectedContribution,
        AKARI_GOLD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
        AKARI_GOLD_WEIGHT
      )
    )
  );
  const participationScore = avgOrZero(
    summaries.map((summary) => scoreParticipation(summary.killParticipation))
  );
  const visionScore = avgOrZero(
    summaries.map((summary) =>
      scoreExpectedContribution(
        summary.visionScoreRatioToExpectedContribution,
        AKARI_STANDARD_EXPECTED_CONTRIBUTION_FULL_SCORE_RATIO,
        AKARI_VISION_MAX_SCORE
      )
    )
  );

  const total =
    kdaScore +
    winRateScore +
    dmgScore +
    dmgTakenScore +
    healingScore +
    csScore +
    goldScore +
    participationScore +
    visionScore;

  return {
    kdaScore,
    winRateScore,
    dmgScore,
    dmgTakenScore,
    healingScore,
    csScore,
    goldScore,
    participationScore,
    visionScore,
    total,
    maxScore: AKARI_MAX_SCORE,
    outstanding:
      total >= AGGREGATE_AKARI_OUTSTANDING_THRESHOLD &&
      analysis.count >= AGGREGATE_AKARI_OUTSTANDING_MIN_COUNT,
    extraordinary:
      total >= AGGREGATE_AKARI_EXTRAORDINARY_THRESHOLD &&
      analysis.count >= AGGREGATE_AKARI_EXTRAORDINARY_MIN_COUNT
  };
}

function isPveOrNonMatchedGame(basic: MatchBasicInfo): boolean {
  return basic.gameType !== 'MATCHED_GAME' || isPveQueue(basic.queueId);
}

function isAbortedOrRemadeGame(participant: MatchParticipant): boolean {
  return participant.winResult === 'abort' || participant.winResult === 'remake';
}

/**
 * 聚合多局战绩为玩家分析结果（过滤掉 PVE/非匹配/取消/重开的对局）
 */
export function analyzeGames(
  games: Game[],
  puuid: string,
  options?: AnalyzeGamesOptions
): AggregatedAnalysis | null {
  if (games.length === 0) {
    return null;
  }

  const { filterAbortedOrRemadeGames = true, filterPveAndNonMatchedGames = true } = options || {};

  const prepared: PreparedGame[] = [];

  for (const game of games) {
    const basic = toBasicInfo(game);

    if (filterPveAndNonMatchedGames && isPveOrNonMatchedGame(basic)) continue;

    const participants = toParticipants(game, basic);
    const participant = participants.find((p) => p.puuid === puuid);

    if (!participant) continue;
    if (filterAbortedOrRemadeGames && isAbortedOrRemadeGame(participant)) continue;

    const teamParticipants = participants.filter(
      (p) => p.teamIdentifier === participant.teamIdentifier
    );
    const summary = computeSingleSummary(basic, participant, teamParticipants, participants);
    const single: SingleAnalysis = {
      gameId: game.gameId,
      summary,
      akariScore: computeSingleAkariScore(summary)
    };

    prepared.push({
      gameId: game.gameId,
      basic,
      participant,
      participants,
      single
    });
  }

  const count = prepared.length;
  const summary = computeAggregatedSummary(prepared);

  const map: Record<number, SingleAnalysis> = {};
  for (const p of prepared) {
    map[p.gameId] = p.single;
  }

  return {
    count,
    summary,
    akariScore: computeAggregatedAkariScore({ count, summary, games: prepared }),
    map,
    detailsCount: 0
  };
}
