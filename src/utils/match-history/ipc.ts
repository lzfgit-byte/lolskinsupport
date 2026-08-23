/**
 * 渲染进程侧战绩查询 IPC 封装
 * 主进程对应实现位于 electron/export/match-history.ts（自动注册为 IPC 方法）
 */
import { executeFunction } from '@/utils/ipc';
import type { MatchHistoryResponse, SummonerInfo } from './types';

/** LCU 是否已连接 */
export const mhIsConnected = async (): Promise<boolean> => {
  return executeFunction('mhIsConnected');
};

/** 获取当前登录召唤师信息 */
export const mhGetCurrentSummoner = async (): Promise<SummonerInfo> => {
  return executeFunction('mhGetCurrentSummoner');
};

/** 按召唤师名字搜索，未找到时返回 null */
export const mhSearchSummonerByName = async (name: string): Promise<SummonerInfo | null> => {
  return executeFunction('mhSearchSummonerByName', name);
};

/** 按 puuid 获取召唤师信息 */
export const mhGetSummonerByPuuid = async (puuid: string): Promise<SummonerInfo> => {
  return executeFunction('mhGetSummonerByPuuid', puuid);
};

/** 查询某个玩家的战绩列表 */
export const mhGetMatchHistory = async (
  puuid: string,
  begIndex = 0,
  endIndex = 19
): Promise<MatchHistoryResponse> => {
  return executeFunction('mhGetMatchHistory', puuid, begIndex, endIndex);
};

/** 获取单局对局详情 */
export const mhGetGameDetails = async (gameId: number): Promise<any> => {
  return executeFunction('mhGetGameDetails', gameId);
};

/**
 * 通过 LCU 代理获取客户端本地资源图片（头像、海克斯强化图标等），
 * 返回 base64 data URL；失败时返回 null
 */
export const mhGetLcuImage = async (assetPath: string): Promise<string | null> => {
  return executeFunction('mhGetLcuImage', assetPath);
};

/**
 * 通过 LCU 代理获取客户端本地 JSON 资源（如 items.json），失败时返回 null
 */
export const mhGetLcuJson = async (assetPath: string): Promise<any | null> => {
  return executeFunction('mhGetLcuJson', assetPath);
};
