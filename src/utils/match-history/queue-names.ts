/**
 * 对局模式（queueId）展示名称
 */
import { mhGetLcuJson } from './ipc';

const QUEUE_NAMES: Record<number, string> = {
  400: '5v5 自选模式',
  410: '5v5 排位选人',
  420: '单双排位',
  430: '匹配模式',
  440: '灵活排位',
  450: '极地大乱斗',
  460: '轮换模式',
  470: '轮换模式',
  480: '峡谷极速',
  490: '快速游戏',
  700: '训练模式',
  800: '人机对战',
  810: '人机对战',
  820: '人机对战',
  830: '人机对战',
  840: '人机对战',
  850: '人机对战',
  860: '人机对战',
  870: '人机对战',
  880: '人机对战',
  890: '人机对战',
  900: '无限火力',
  910: '无限乱斗',
  920: '极限闪击',
  940: '终极魔典',
  950: '云顶之弈',
  1010: '云顶之弈（排位）',
  1020: '云顶之弈',
  1090: '云顶之弈（双人作战）',
  1100: '云顶之弈（狂暴模式）',
  1200: '云顶之弈（匹配）',
  1700: '斗魂竞技场',
  1900: '斗魂竞技场',
  2400: '海克斯大乱斗',
  4320: '人机对战'
};

let loadedQueueNames: Map<number, string> | null = null;

/**
 * 从 LCU queues.json 加载完整队列名（客户端本地化），
 * 已知模式用中文表覆盖以保证与 LeagueAkari 一致；结果会缓存。
 */
export async function loadQueueNames(): Promise<Map<number, string>> {
  if (loadedQueueNames) {
    return loadedQueueNames;
  }
  const map = new Map<number, string>();
  try {
    const res: any = await mhGetLcuJson('queues.json');
    (Array.isArray(res) ? res : []).forEach((q: any) => {
      const id = Number(q.id);
      if (Number.isFinite(id) && (q.name || q.description)) {
        map.set(id, q.name || q.description);
      }
    });
  } catch {
    // 忽略，回退到静态表
  }
  for (const [id, name] of Object.entries(QUEUE_NAMES)) {
    map.set(Number(id), name);
  }
  loadedQueueNames = map;
  return map;
}

export const getQueueName = (queueId: number, map?: Map<number, string>): string => {
  if (typeof queueId !== 'number') {
    queueId = Number(queueId);
  }
  if (map && map.has(queueId)) {
    return map.get(queueId)!;
  }
  return QUEUE_NAMES[queueId] || `模式 ${queueId}`;
};
