/**
 * 战绩查询（主进程侧）
 *
 * 通过 use-ipc-main 自动注册为可被渲染进程调用的 IPC 方法（函数名即方法名）。
 * 仅依赖本地 LCU 连接，数据源为 LCU API。
 *
 * 说明：这些方法会被 `electron/export/index.ts` 统一导出，进而被
 * `electron/hooks/use-ipc-main.ts` 注册为 ipcMain.handle。
 */
import { lcuConnector } from '../http/lcuConnector';
import { lcuRequestManager } from '../http/lcuRequestManager';

/** LCU 是否已连接 */
export const mhIsConnected = (): boolean => {
  return lcuConnector.isConnected();
};

/** 获取当前登录召唤师信息 */
export const mhGetCurrentSummoner = async (): Promise<any> => {
  return lcuConnector.request('GET', '/lol-summoner/v1/current-summoner');
};

/**
 * 按召唤师名字搜索召唤师
 * 未找到时（LCU 404）返回 null，其余错误向上抛出
 */
export const mhSearchSummonerByName = async (name: string): Promise<any> => {
  try {
    return await lcuConnector.request(
      'GET',
      `/lol-summoner/v1/summoners?name=${encodeURIComponent(name)}`
    );
  } catch (error: any) {
    if (error.httpStatus === 404) {
      return null;
    }
    throw error;
  }
};

/** 按 puuid 获取召唤师信息 */
export const mhGetSummonerByPuuid = async (puuid: string): Promise<any> => {
  return lcuConnector.request('GET', `/lol-summoner/v2/summoners/puuid/${puuid}`);
};

/** 查询某个玩家的战绩列表（LCU 分页参数为 begIndex / endIndex，含 beg 不含 end） */
export const mhGetMatchHistory = async (
  puuid: string,
  begIndex = 0,
  endIndex = 19
): Promise<any> => {
  return lcuConnector.request(
    'GET',
    `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${begIndex}&endIndex=${endIndex}`
  );
};

/** 获取单局对局详情（按 gameId，与 puuid 无关） */
export const mhGetGameDetails = async (gameId: number): Promise<any> => {
  return lcuRequestManager.request(
    `mh:game-details:${gameId}`,
    () => lcuConnector.request('GET', `/lol-match-history/v1/games/${gameId}`),
    10 * 60 * 1000
  );
};

/**
 * 通过 LCU 代理获取客户端本地资源图片（如头像、海克斯强化图标），
 * 返回 base64 data URL；失败或未连接时返回 null。
 *
 * assetPath 形如 `profile-icons/1234.jpg`，对应
 * `/lol-game-data/assets/v1/profile-icons/1234.jpg`
 */
export const mhGetLcuImage = async (assetPath: string): Promise<string | null> => {
  try {
    const buf = await lcuConnector.requestArrayBuffer(
      'GET',
      `/lol-game-data/assets/v1/${assetPath}`
    );
    if (!buf || !buf.byteLength) {
      return null;
    }
    const ext = assetPath.split('.').pop()?.toLowerCase() || 'png';
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
        ? 'image/webp'
        : 'image/png';
    return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return null;
  }
};
