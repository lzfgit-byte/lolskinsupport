/**
 * 战绩数据适配：将 LCU 原始数据映射为抽象的分析/展示格式
 *
 * 迁移自 League Akari（src/shared/data-adapter/match-history/*），
 * 仅保留 LCU 数据源分支，并精简为战绩分析所需字段。
 */
import { noZero } from './constants';
import type { Game, Participant, Stats } from './types';

export type WinResult = 'win' | 'loss' | 'remake' | 'abort';

export type WinResultInfo = {
  isSurrender: boolean;
  result: WinResult;
};

export type MatchBasicInfo = {
  dataSource: 'lcu';
  gameVersion: string;
  gameId: number;
  isTwoTeam: boolean;
  isCherrySubteam: boolean;
  endOfGameResult?: string;
  gameCreation: number;
  gameDuration: number;
  gameType: string;
  queueId: number;
  gameMode: string;
  mapId: number;
  gameModeMutators: string[] | null;
};

export type MatchParticipant = {
  puuid: string;
  participantId: number;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  championId: number;
  position: string | null;
  teamId: number;
  teamIdentifier: string;
  items: number[];
  spells: number[];
  /** 海克斯强化（非强化模式为 0） */
  augments: number[];
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  killParticipation: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  goldEarned: number;
  cs: number;
  win: boolean;
  isSurrender: boolean;
  winResult: WinResult;
  totalDamageToTowers: number;
  totalHeal: number;
  visionScore: number;
  timeCCingOthers: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  // LCU 不提供这些字段，统一置空以兼容分析逻辑
  totalDamageShieldedOnTeammates: number | null;
};

export function computeWinResult(
  endOfGameResult: string | undefined,
  participant: {
    gameEndedInEarlySurrender: boolean;
    gameEndedInSurrender: boolean;
    teamEarlySurrendered: boolean;
    win: boolean;
  }
): WinResultInfo {
  // 目前已知有：Abort_AntiCheatExit, Abort_Unexpected, Abort_TooFewPlayers
  if (endOfGameResult && endOfGameResult.startsWith('Abort_')) {
    return { isSurrender: false, result: 'abort' };
  }

  if (participant.gameEndedInEarlySurrender) {
    return { isSurrender: true, result: 'remake' };
  }

  if (participant.teamEarlySurrendered) {
    return { isSurrender: true, result: 'loss' };
  }

  if (participant.win) {
    return { isSurrender: false, result: 'win' };
  }

  return { isSurrender: participant.gameEndedInSurrender, result: 'loss' };
}

export function toBasicInfo(game: Game): MatchBasicInfo {
  return {
    dataSource: 'lcu',
    gameVersion: game.gameVersion,
    gameId: game.gameId,
    isTwoTeam: game.gameMode !== 'CHERRY',
    isCherrySubteam: game.gameMode === 'CHERRY',
    endOfGameResult: game.endOfGameResult,
    gameCreation: game.gameCreation,
    gameDuration: game.gameDuration,
    gameType: game.gameType,
    queueId: game.queueId,
    gameMode: game.gameMode,
    mapId: game.mapId,
    gameModeMutators: game.gameModeMutators ?? null
  };
}

function mapStatsToParticipant(
  participant: Participant,
  identity: { player: { puuid: string; gameName: string; summonerName: string; tagLine: string; profileIcon: number } } | undefined,
  stats: Stats,
  basicInfo: MatchBasicInfo,
  teamIdentifier: string,
  totalKills: Record<string, number>
): MatchParticipant | null {
  if (!identity) {
    return null;
  }

  const { isSurrender, result } = computeWinResult(basicInfo.endOfGameResult, stats);

  return {
    puuid: identity.player.puuid,
    participantId: participant.participantId,
    gameName: identity.player.gameName || identity.player.summonerName,
    tagLine: identity.player.tagLine,
    profileIconId: identity.player.profileIcon,
    championId: participant.championId,
    position: null,
    teamId: participant.teamId,
    teamIdentifier,
    items: [stats.item0, stats.item1, stats.item2, stats.item3, stats.item4, stats.item5, stats.item6],
    spells: [participant.spell1Id, participant.spell2Id],
    augments: [
      stats.playerAugment1,
      stats.playerAugment2,
      stats.playerAugment3,
      stats.playerAugment4,
      stats.playerAugment5,
      stats.playerAugment6
    ],
    level: stats.champLevel,
    kills: stats.kills,
    deaths: stats.deaths,
    assists: stats.assists,
    kda: (stats.kills + stats.assists) / noZero(stats.deaths),
    killParticipation: (stats.kills + stats.assists) / noZero(totalKills[teamIdentifier]),
    totalDamageDealtToChampions: stats.totalDamageDealtToChampions,
    totalDamageTaken: stats.totalDamageTaken,
    goldEarned: stats.goldEarned,
    cs: stats.neutralMinionsKilled + stats.totalMinionsKilled,
    win: stats.win,
    isSurrender,
    winResult: result,
    totalDamageToTowers: stats.damageDealtToTurrets,
    totalHeal: stats.totalHeal,
    visionScore: stats.visionScore ?? 0,
    timeCCingOthers: stats.timeCCingOthers,
    doubleKills: stats.doubleKills,
    tripleKills: stats.tripleKills,
    quadraKills: stats.quadraKills,
    pentaKills: stats.pentaKills,
    totalDamageShieldedOnTeammates: null
  };
}

export function toParticipants(game: Game, basicInfo: MatchBasicInfo): MatchParticipant[] {
  const totalKills = game.participants.reduce(
    (acc, participant) => {
      const teamIdentifier = basicInfo.isCherrySubteam
        ? `CHERRY-${participant.stats.playerSubteamId}`
        : `TEAM-${participant.teamId}`;
      acc[teamIdentifier] = (acc[teamIdentifier] || 0) + participant.stats.kills;
      return acc;
    },
    {} as Record<string, number>
  );

  return game.participants
    .map<MatchParticipant | null>((participant) => {
      const identity = game.participantIdentities.find(
        (i) => i.participantId === participant.participantId
      );
      const teamIdentifier = basicInfo.isCherrySubteam
        ? `CHERRY-${participant.stats.playerSubteamId}`
        : `TEAM-${participant.teamId}`;
      return mapStatsToParticipant(
        participant,
        identity,
        participant.stats,
        basicInfo,
        teamIdentifier,
        totalKills
      );
    })
    .filter((p): p is MatchParticipant => p !== null);
}
