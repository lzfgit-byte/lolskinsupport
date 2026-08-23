/**
 * 英雄联盟启动（迁移自 LOLauncher）
 *
 * 功能：启动游戏前先应用所选语言（并启动语言监听），再通过 Riot 客户端启动英雄联盟。
 * 等价于 LOLauncher 中「启动游戏」按钮的行为：
 *   1. 更新语言配置文件（apply 所选语言）
 *   2. 启动配置文件监听
 *   3. 找到 RiotClientServices.exe 并启动游戏
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import yaml from 'js-yaml';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import { RIOT_CLIENT_PATH, configPath } from '../const';
import { detectLocaleConfigFile, startLocaleWatcher } from './locale-watcher';

// ===================== 配置读写（与 locale-watcher 保持一致，避免循环依赖） =====================
const readConfig = (): Record<string, any> => {
  try {
    if (!existsSync(configPath)) {
      return {};
    }
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('[LaunchGame] readConfig error:', e);
    return {};
  }
};

/** 读取语言配置文件的 product_install_root（游戏安装根目录） */
const readProductInstallRoot = (filePath: string): string | null => {
  try {
    const content = yaml.load(readFileSync(filePath, 'utf8'));
    return content?.product_install_root || null;
  } catch (e) {
    console.error(`[LaunchGame] 读取 ${filePath} 失败:`, e);
    return null;
  }
};

/**
 * 查找所有可用的 RiotClientServices.exe 路径
 * 来源：手动配置、语言配置文件的 product_install_root、配置的游戏路径
 */
export const findRiotClients = (): string[] => {
  const candidates = new Set<string>();

  // 1. 手动配置的 Riot 客户端路径
  const manual = readConfig()[RIOT_CLIENT_PATH];
  if (manual) {
    candidates.add(manual);
  }

  // 2. 从语言配置文件的 product_install_root 推导（同 LOLauncher：<root>/Riot Client/RiotClientServices.exe）
  for (const settingFile of detectLocaleConfigFile()) {
    const root = readProductInstallRoot(settingFile);
    if (root) {
      candidates.add(path.join(root, 'Riot Client', 'RiotClientServices.exe'));
    }
  }

  // 3. 从配置的游戏路径推导（<gamePath>/../Riot Client/RiotClientServices.exe）
  const gamePath = readConfig().GAME_PATH;
  if (gamePath) {
    candidates.add(path.resolve(gamePath, '..', 'Riot Client', 'RiotClientServices.exe'));
  }

  // @ts-ignore
  return [...candidates].filter((p) => p && existsSync(p));
};

/**
 * 启动英雄联盟：先应用所选语言并启动监听，再启动游戏
 * @returns 若找到多个 Riot 客户端，返回 candidates 由前端选择
 */
export const launchLeagueOfLegends = (): { ok: boolean; msg: string; candidates: string[] } => {
  // 1. 应用语言并启动监听（打开软件后一般已自动监听，这里确保语言已应用）
  startLocaleWatcher({ silent: true });

  // 2. 查找 Riot 客户端
  const clients = findRiotClients();
  if (clients.length === 0) {
    const msg = '未找到 RiotClientServices.exe，请先在设置中配置游戏路径或语言配置文件。';
    MessageUtil.error(msg);
    return { ok: false, msg, candidates: [] };
  }
  if (clients.length > 1) {
    return { ok: false, msg: '找到多个游戏路径，请选择一个', candidates: clients };
  }
  return { ok: true, msg: '准备启动', candidates: clients };
};

/** 使用指定 Riot 客户端路径启动英雄联盟 */
export const launchLeagueOfLegendsAt = async (
  clientPath: string
): Promise<{ ok: boolean; msg: string }> => {
  if (!clientPath || !existsSync(clientPath)) {
    const msg = `Riot 客户端不存在: ${clientPath}`;
    MessageUtil.error(msg);
    return { ok: false, msg };
  }
  try {
    LogMsgUtil.sendLogMsg(`英雄联盟，启动！ ${clientPath}`);
    // 通过 Riot Client 直接启动英雄联盟（正式服）
    spawn(clientPath, ['--launch-product=league_of_legends', '--launch-patchline=live'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    MessageUtil.success('英雄联盟，启动！');
    return { ok: true, msg: '启动成功' };
  } catch (e) {
    const msg = `启动失败: ${e}`;
    MessageUtil.error(msg);
    return { ok: false, msg };
  }
};
