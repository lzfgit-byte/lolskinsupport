/**
 * Bridge: lolskinsupport -> R3nzSkin.
 *
 * Mod-tools mounting is disabled for champion skins in this build. Picking a
 * skin now only writes R3nzSkin's own configuration, so the skin is already
 * applied when the game finishes loading (no second selection inside the game).
 *
 * Target file: `<Documents>\R3nzSkin\R3nzSkin64`
 *   { "Ahri.current_combo_skin_index": 12, ... }
 *
 * The index is computed from the running client's champion skin list whenever
 * LCU is connected (authoritative for the current patch/region); otherwise the
 * bundled Tencent catalogue is used and the result is flagged as approximate.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { HERO_SKIN } from '@ghs/constant';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import { readLolDataFile } from './lol-data';
import {
  countConfiguredChampions,
  findLolSkin,
  mergeR3nzConfig,
  parseChampionSkinList,
  parseLolHeroData,
  resolveSkinIndex,
  type ChampionSkinList,
  type R3nzSkinConfig,
  type SkinListSource,
} from './r3nzskin-core';

/** Same folder as electron/const `tempPath`, duplicated to avoid an import cycle. */
const getLolSkinSupportConfigPath = (): string =>
  join(process.env.LOCALAPPDATA ?? '', 'lol-skin-ll', 'config.json');

/** lolskinsupport 自己的设置键：自动应用（锁定英雄/打开皮肤页时写 R3nzSkin）。 */
const AUTO_APPLY_KEY = 'AUTO_APPLY_R3NZSKIN';

/** Injected by the LCU layer so this module never imports the connector (cycle free). */
export type ChampionSkinListProvider = (heroId: string) => Promise<unknown> | unknown;

let championSkinListProvider: ChampionSkinListProvider | null = null;

export const setChampionSkinListProvider = (provider: ChampionSkinListProvider | null): void => {
  // 通过 IPC 调用时传进来的是字符串，忽略非法值
  championSkinListProvider = typeof provider === 'function' ? provider : null;
};

/** 自动应用开关（默认开）。渲染进程的浮动开关和主进程的锁定英雄同步共用它。 */
export const getAutoApplySetting = (): { enabled: boolean } => {
  const raw = readJson<Record<string, any>>(getLolSkinSupportConfigPath(), {}).value?.[
    AUTO_APPLY_KEY
  ];
  if (raw === undefined || raw === null || raw === '') {
    return { enabled: true };
  }
  return { enabled: `${raw}` !== 'false' && `${raw}` !== '0' };
};

export const setAutoApplySetting = (enabled: boolean): { enabled: boolean } => {
  const file = getLolSkinSupportConfigPath();
  const config = readJson<Record<string, any>>(file, {});
  config.value[AUTO_APPLY_KEY] = enabled ? 'true' : 'false';
  writeJsonAtomic(file, config.value);
  return { enabled };
};

export interface R3nzSkinPaths {
  dir: string;
  configFile: string;
}

export const getR3nzSkinPaths = (): R3nzSkinPaths => {
  const dir = process.env.R3NZSKIN_DIR?.trim() || join(homedir(), 'Documents', 'R3nzSkin');
  return { dir, configFile: join(dir, 'R3nzSkin64') };
};

interface ReadResult<T> {
  value: T;
  error?: string;
}

const readJson = <T>(file: string, fallback: T): ReadResult<T> => {
  try {
    if (!existsSync(file)) {
      return { value: fallback };
    }
    const raw = readFileSync(file, { encoding: 'utf-8' });
    if (!raw.trim()) {
      return { value: fallback };
    }
    return { value: JSON.parse(raw) as T };
  } catch (error: any) {
    return { value: fallback, error: `${error?.message ?? error}` };
  }
};

/** Write JSON through a temp file so R3nzSkin never reads a half written file. */
const writeJsonAtomic = (file: string, value: unknown): void => {
  mkdirSync(dirname(file), { recursive: true });
  const tempFile = `${file}.tmp`;
  writeFileSync(tempFile, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8' });
  if (existsSync(file)) {
    try {
      copyFileSync(file, `${file}.bak`);
    } catch {
      // 备份失败不影响主流程
    }
  }
  renameSync(tempFile, file);
};

const readLiveSkinList = async (heroId: string): Promise<ChampionSkinList | null> => {
  if (!championSkinListProvider) {
    return null;
  }
  try {
    const raw = await championSkinListProvider(heroId);
    return parseChampionSkinList(raw as any);
  } catch (error: any) {
    LogMsgUtil.sendLogMsg(`[R3nzSkin] 读取客户端皮肤列表失败：${error?.message ?? error}`);
    return null;
  }
};

/** Read the skin this hero was last assigned in lolskinsupport (HERO_SKIN map). */
export const readSavedLolSkinSelection = (heroId: string): string => {
  const raw = readJson<Record<string, any>>(getLolSkinSupportConfigPath(), {}).value?.[HERO_SKIN];
  if (!raw) {
    return '';
  }
  try {
    const map = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return `${map?.[heroId] ?? ''}`;
  } catch {
    return '';
  }
};

export interface PublishSkinResult {
  ok: boolean;
  reason?: string;
  alias?: string;
  skinName?: string;
  lolSkinId?: string;
  skinId?: number;
  index?: number;
  listSource?: SkinListSource;
  fellBackToParent?: boolean;
  note?: string;
  configFile?: string;
}

/**
 * Write one champion's skin choice into R3nzSkin's config.
 * @param heroId    LoL hero id, e.g. "1" for Annie
 * @param lolSkinId lolskinsupport skin id, e.g. "1001"
 * @param options.silent skip the success toast (used by the LCU auto sync)
 */
export const publishSkinToR3nzSkin = async (
  heroId: string,
  lolSkinId: string,
  options: { silent?: boolean } = {}
): Promise<PublishSkinResult> => {
  const paths = getR3nzSkinPaths();
  const hero = parseLolHeroData(readLolDataFile(`heroes/${heroId}.json`));

  if (!hero) {
    return { ok: false, reason: `未找到英雄 ${heroId} 的皮肤数据（public/lol-data/heroes 缺失）` };
  }

  const liveList = await readLiveSkinList(heroId);
  const requested = findLolSkin(hero, `${lolSkinId}`);
  const { index, skinId, listSource, fellBackToParent, note } = resolveSkinIndex(
    hero,
    `${lolSkinId}`,
    liveList
  );

  if (index <= 0) {
    return {
      ok: false,
      reason: `皮肤 ${lolSkinId} 不在英雄 ${hero.alias} 的皮肤列表中，R3nzSkin 无法通过配置选中它`,
    };
  }

  const config = readJson<R3nzSkinConfig>(paths.configFile, {});
  if (config.error) {
    return {
      ok: false,
      reason: `R3nzSkin64 无法解析（${config.error}），为避免破坏已放弃写入`,
    };
  }

  writeJsonAtomic(paths.configFile, mergeR3nzConfig(config.value, hero.alias, index));

  const displayName = requested?.name || `${skinId}`;
  const approximate = listSource === 'bundled';
  LogMsgUtil.sendLogMsg(
    `[R3nzSkin] ${hero.alias} <- ${displayName} (index=${index}, skin_id=${skinId}, list=${listSource})`
  );

  if (!options.silent) {
    MessageUtil.success(`已写入 R3nzSkin：${hero.alias} / ${displayName}（第 ${index} 个皮肤）`);
    if (note) {
      MessageUtil.warning(note);
    }
    if (approximate) {
      MessageUtil.warning(
        '当前未连接游戏客户端，皮肤序号是按内置皮肤库推算的；补丁更新后可能偏差，连上客户端后再点一次即可精确'
      );
    }
  }

  return {
    ok: true,
    alias: hero.alias,
    skinName: displayName,
    lolSkinId: `${lolSkinId}`,
    skinId,
    index,
    listSource,
    fellBackToParent,
    note,
    configFile: paths.configFile,
  };
};

/** Called by the LCU hook when the local player locks a champion. */
export const autoSyncOnChampionSelected = async (
  championId: number | string
): Promise<PublishSkinResult> => {
  const heroId = `${championId ?? ''}`;
  if (!/^\d+$/.test(heroId) || heroId === '0') {
    return { ok: false, reason: '无效的英雄 ID' };
  }

  if (!getAutoApplySetting().enabled) {
    return { ok: false, reason: '自动应用已关闭' };
  }

  const savedLolSkinId = readSavedLolSkinSelection(heroId);
  if (!savedLolSkinId) {
    return { ok: false, reason: `英雄 ${heroId} 还没有在 lolskinsupport 里选过皮肤` };
  }

  const result = await publishSkinToR3nzSkin(heroId, savedLolSkinId, { silent: true });
  if (!result.ok) {
    LogMsgUtil.sendLogMsg(`[R3nzSkin] 自动同步失败：${result.reason}`);
  } else {
    LogMsgUtil.sendLogMsg(
      `[R3nzSkin] 自动同步 ${result.alias} -> 第 ${result.index} 个皮肤（${result.listSource}）`
    );
  }
  return result;
};

export interface R3nzSkinStatus {
  dir: string;
  configFile: string;
  configExists: boolean;
  configuredChampions: number;
}

export const getR3nzSkinStatus = (): R3nzSkinStatus => {
  const paths = getR3nzSkinPaths();
  const config = readJson<R3nzSkinConfig>(paths.configFile, {});
  return {
    dir: paths.dir,
    configFile: paths.configFile,
    configExists: existsSync(paths.configFile),
    configuredChampions: countConfiguredChampions(config.value),
  };
};

/** Remove this champion's saved skin so R3nzSkin keeps its default skin. */
export const clearChampionSkinSelection = (heroId: string): { ok: boolean; alias?: string } => {
  const paths = getR3nzSkinPaths();
  const hero = parseLolHeroData(readLolDataFile(`heroes/${heroId}.json`));
  if (!hero) {
    return { ok: false };
  }

  const config = readJson<R3nzSkinConfig>(paths.configFile, {});
  if (config.error) {
    return { ok: false };
  }

  const key = `${hero.alias}.current_combo_skin_index`;
  if (key in config.value) {
    delete config.value[key];
    writeJsonAtomic(paths.configFile, config.value);
  }
  return { ok: true, alias: hero.alias };
};
