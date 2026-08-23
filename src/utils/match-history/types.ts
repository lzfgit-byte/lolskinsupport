/**
 * LCU 战绩相关类型定义
 *
 * 迁移自 League Akari（@shared/types/league-client/match-history 等），
 * 精简为仅 LCU 数据源所需的字段。
 */

/** LCU 召唤师信息（/lol-summoner/v1/current-summoner） */
export interface SummonerInfo {
  accountId: number;
  displayName: string;
  gameName: string;
  internalName: string;
  nameChangeFlag: boolean;
  percentCompleteForNextLevel: number;
  privacy: string;
  profileIconId: number;
  puuid: string;
  rerollPoints: {
    currentPoints: number;
    pointsCostToRoll: number;
    numberOfRolls: number;
  };
  summonerId: number;
  summonerLevel: number;
  tagLine: string;
  unnamed: boolean;
  xpSinceLastLevel: number;
  xpUntilNextLevel: number;
}

/** LCU 战绩列表响应（/lol-match-history/v1/products/lol/{puuid}/matches） */
export interface MatchHistoryResponse {
  accountId: number;
  games: {
    gameBeginDate: string;
    gameCount: number;
    gameEndDate: string;
    gameIndexBegin: number;
    gameIndexEnd: number;
    games: Game[];
  };
  platformId: string;
}

/** LCU 单局对局数据（战绩列表项与 /lol-match-history/v1/games/{id} 同构） */
export interface Game {
  endOfGameResult: string;
  gameCreation: number;
  gameCreationDate: string;
  gameDuration: number;
  gameId: number;
  gameMode: string;
  gameType: string;
  gameVersion: string;
  mapId: number;
  participantIdentities: ParticipantIdentity[];
  participants: Participant[];
  platformId: string;
  queueId: number;
  seasonId: number;
  teams: Team[];
  gameModeMutators: string[];
}

export interface Team {
  bans: { championId: number; pickTurn: number }[];
  baronKills: number;
  dominionVictoryScore: number;
  dragonKills: number;
  hordeKills: number;
  firstBaron: boolean;
  firstBlood: boolean;
  firstDargon: boolean; // LCU 接口中就是如此拼写
  firstInhibitor: boolean;
  firstTower: boolean;
  inhibitorKills: number;
  riftHeraldKills: number;
  teamId: number;
  towerKills: number;
  vilemawKills: number;
  win: string | 'Win' | 'Fail';
}

export interface Participant {
  championId: number;
  highestAchievedSeasonTier: string;
  participantId: number;
  spell1Id: number;
  spell2Id: number;
  stats: Stats;
  teamId: number;
  timeline: Timeline;
}

export interface Timeline {
  creepsPerMinDeltas: Record<string, number>;
  csDiffPerMinDeltas: Record<string, number>;
  damageTakenDiffPerMinDeltas: Record<string, number>;
  damageTakenPerMinDeltas: Record<string, number>;
  goldPerMinDeltas: Record<string, number>;
  lane: string;
  participantId: number;
  role: string;
  xpDiffPerMinDeltas: Record<string, number>;
  xpPerMinDeltas: Record<string, number>;
}

export interface Stats {
  assists: number;
  causedEarlySurrender: boolean;
  champLevel: number;
  combatPlayerScore: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  damageSelfMitigated: number;
  deaths: number;
  doubleKills: number;
  earlySurrenderAccomplice: boolean;
  firstBloodAssist: boolean;
  firstBloodKill: boolean;
  firstInhibitorAssist: boolean;
  firstInhibitorKill: boolean;
  firstTowerAssist: boolean;
  firstTowerKill: boolean;
  gameEndedInEarlySurrender: boolean;
  gameEndedInSurrender: boolean;
  goldEarned: number;
  goldSpent: number;
  inhibitorKills: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  killingSprees: number;
  kills: number;
  largestCriticalStrike: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  magicDamageDealt: number;
  magicDamageDealtToChampions: number;
  magicalDamageTaken: number;
  neutralMinionsKilled: number;
  neutralMinionsKilledEnemyJungle: number;
  neutralMinionsKilledTeamJungle: number;
  objectivePlayerScore: number;
  participantId: number;
  pentaKills: number;
  perk0: number;
  perk0Var1: number;
  perk0Var2: number;
  perk0Var3: number;
  perk1: number;
  perk1Var1: number;
  perk1Var2: number;
  perk1Var3: number;
  perk2: number;
  perk2Var1: number;
  perk2Var2: number;
  perk2Var3: number;
  perk3: number;
  perk3Var1: number;
  perk3Var2: number;
  perk3Var3: number;
  perk4: number;
  perk4Var1: number;
  perk4Var2: number;
  perk4Var3: number;
  perk5: number;
  perk5Var1: number;
  perk5Var2: number;
  perk5Var3: number;
  perkPrimaryStyle: number;
  perkSubStyle: number;
  physicalDamageDealt: number;
  physicalDamageDealtToChampions: number;
  physicalDamageTaken: number;
  playerAugment1: number;
  playerAugment2: number;
  playerAugment3: number;
  playerAugment4: number;
  playerAugment5: number;
  playerAugment6: number;
  playerSubteamId: number;
  quadraKills: number;
  roleBoundItem: number;
  sightWardsBoughtInGame: number;
  subteamPlacement: number;
  teamEarlySurrendered: boolean;
  timeCCingOthers: number;
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  totalHeal: number;
  totalMinionsKilled: number;
  totalPlayerScore: number;
  totalScoreRank: number;
  totalTimeCrowdControlDealt: number;
  totalUnitsHealed: number;
  tripleKills: number;
  trueDamageDealt: number;
  trueDamageDealtToChampions: number;
  trueDamageTaken: number;
  turretKills: number;
  unrealKills: number;
  visionScore: number;
  visionWardsBoughtInGame: number;
  wardsKilled: number;
  wardsPlaced: number;
  win: boolean;
}

export interface ParticipantIdentity {
  participantId: number;
  player: Player;
}

export interface Player {
  accountId: number;
  currentAccountId: number;
  currentPlatformId: string;
  matchHistoryUri: string;
  platformId: string;
  profileIcon: number;
  summonerId: number;
  puuid: string;
  gameName: string;
  tagLine: string;
  summonerName: string;
}
