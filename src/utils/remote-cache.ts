import { message } from 'ant-design-vue';
import http from '@/utils/http';
import { executeFunction } from '@/utils/ipc';

/** 保存远程接口数据到本地缓存（electron 侧） */
const saveRemoteCache = (key: string, text: string): Promise<string> =>
  executeFunction('saveRemoteCache', key, text);

/** 读取本地缓存的远程接口数据（electron 侧） */
const readRemoteCache = (key: string): Promise<string> =>
  executeFunction('readRemoteCache', key);

/** 读取随包发布的本地 JSON（electron 侧，相对 public/lol-data） */
const readLolDataFile = (relativePath: string): Promise<string> =>
  executeFunction('readLolDataFile', relativePath);

/** 英雄列表缓存标识 */
export const HERO_LIST_CACHE_KEY = 'hero_list';

/** 英雄皮肤列表缓存标识 */
export const heroSkinsCacheKey = (heroId: string | number) => `hero_skins_${heroId}`;

/** 随包发布的本地数据文件（相对 public/lol-data） */
export const LOL_DATA = {
  /** 英雄列表 */
  heroList: 'hero_list.json',
  /** 单个英雄的皮肤数据 */
  heroSkins: (heroId: string | number) => `heroes/${heroId}.json`,
  /** 数据包信息（生成时间/版本） */
  meta: 'meta.json',
};

export interface CachedFetchResult<T> {
  data: T;
  /** local=随包 JSON，cache=上次成功请求的缓存，network=实时请求 */
  source: 'local' | 'cache' | 'network';
  /** true 表示当前数据不是实时请求得到的 */
  fromCache: boolean;
}

export interface CachedFetchOptions<T> {
  /** 单次请求超时时间（毫秒） */
  timeout?: number;
  /** 失败重试次数（不含首次请求） */
  retries?: number;
  /** 重试间隔（毫秒） */
  retryDelay?: number;
  /** 命中缓存时是否静默（不弹出提示） */
  silent?: boolean;
  /** 随包发布的本地 JSON 路径，命中时直接读取、不再请求网络 */
  localFile?: string;
  /**
   * 使用本地数据后是否后台静默刷新（默认关闭）
   * 关闭时只要本地 JSON 存在就不会发起任何网络请求；
   * 开启后会用在线数据更新缓存，并通过 onUpdate 无感刷新页面。
   */
  refresh?: boolean;
  /** 后台刷新拿到不同数据时回调，用于无感更新页面 */
  onUpdate?: (data: T) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readJsonCache = async <T>(key: string): Promise<T | null> => {
  try {
    const text = await readRemoteCache(key);
    if (!text) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const saveJsonCache = async (key: string, data: unknown) => {
  try {
    await saveRemoteCache(key, JSON.stringify(data));
  } catch {
    // 缓存写入失败不影响主流程
  }
};

const readLocalJson = async <T>(localFile: string): Promise<T | null> => {
  try {
    const text = await readLolDataFile(localFile);
    if (!text) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

/** 网络请求，失败按配置重试，全部失败返回 null */
const requestWithRetry = async <T>(
  url: string,
  timeout: number,
  retries: number,
  retryDelay: number
): Promise<T | null> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = (await http.axios.get(url, { timeout })) as unknown as T;
      if (data) {
        return data;
      }
    } catch {
      if (attempt < retries) {
        await wait(retryDelay);
      }
    }
  }
  return null;
};

/**
 * 请求远程 JSON 数据
 *
 * 优先级：
 * 1. 随包发布的本地 JSON（localFile）：直接读文件，不发网络请求（除非传入 refresh: true）
 * 2. 本地文件缺失时，走实时网络请求（带重试）
 * 3. 网络也不可用时，回退最近一次成功请求的本地缓存
 *
 * @returns 本地、网络与缓存都不可用时返回 null
 */
export const fetchJsonWithCache = async <T>(
  url: string,
  key: string,
  options: CachedFetchOptions<T> = {}
): Promise<CachedFetchResult<T> | null> => {
  const {
    timeout = 8000,
    retries = 1,
    retryDelay = 500,
    silent = false,
    localFile,
    refresh = false,
    onUpdate,
  } = options;

  // 1. 随包发布的本地数据
  if (localFile) {
    const local = await readLocalJson<T>(localFile);
    if (local) {
      if (refresh) {
        // 后台静默刷新：不阻塞渲染，拿到新数据后写缓存并通知页面
        void requestWithRetry<T>(url, timeout, retries, retryDelay).then((fresh) => {
          if (!fresh) {
            return;
          }
          void saveJsonCache(key, fresh);
          if (onUpdate && JSON.stringify(fresh) !== JSON.stringify(local)) {
            onUpdate(fresh);
          }
        });
      }
      return { data: local, source: 'local', fromCache: true };
    }
    // 本地数据包缺失（例如新英雄未随包发布），只能回源请求
    console.warn(`[lol-data] 本地数据缺失：${localFile}，回退在线请求 ${url}`);
  }

  // 2. 实时网络请求
  const fresh = await requestWithRetry<T>(url, timeout, retries, retryDelay);
  if (fresh) {
    await saveJsonCache(key, fresh);
    return { data: fresh, source: 'network', fromCache: false };
  }

  // 3. 回退最近一次成功请求的缓存
  const cached = await readJsonCache<T>(key);
  if (cached) {
    if (!silent) {
      message.warn('网络请求失败，已使用本地缓存数据');
    }
    return { data: cached, source: 'cache', fromCache: true };
  }
  return null;
};

/** 读取随包数据包信息（生成时间/版本），无数据时返回 null */
export const getLolDataInfo = async (): Promise<{
  generatedAt?: string;
  version?: string;
  heroCount?: number;
} | null> => {
  try {
    const text = await readLolDataFile(LOL_DATA.meta);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};
