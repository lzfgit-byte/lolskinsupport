import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import WebSocket from 'ws';
import { app } from 'electron';
import axios from 'axios';
import { captureAppScreenshot } from '../utils/screenshot';
import { LogMsgUtil } from '../utils/message';
import { getLockfile } from './connect-league-legends';

const execAsync = promisify(exec);

interface LCUCredentials {
  protocol?: string;
  address?: string;
  port?: string;
  username?: string;
  password: string;
}

interface LCUConnectionOptions {
  pollInterval?: number;
  maxRetries?: number;
}

export class LCUConnector extends EventEmitter {
  private credentials: LCUCredentials | null = null;
  private ws: WebSocket | null = null;
  private connected = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private multikillMonitorInterval: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();
  private axiosInstance: any = null;
  private readonly lockfileCacheDuration = 30000; // 30 seconds
  private multikillEventCursor = 0;
  private lastMultiKillKey: string | null = null;
  private multikillMonitoringActive = false;
  private cachedLiveClientPort: number | null = null;
  private activePlayerName: string | null = null;

  constructor(options: LCUConnectionOptions = {}) {
    super();
    // Options currently not used but kept for future extensibility
    void options;
  }

  async connect(auto = false): Promise<boolean> {
    try {
      // Try to find and read the lockfile
      const credentials = getLockfile();
      if (!credentials) {
        // Don't emit error for auto-connect attempts
        if (!auto && !this.autoConnectInterval) {
          console.log('LCU: League client lockfile not found');
          this.emit('error', new Error('League client not found'));
        }
        return false;
      }

      this.credentials = credentials;

      // Create axios instance with credentials
      this.axiosInstance = axios.create({
        baseURL: `https://127.0.0.1:${credentials.port}`,
        auth: {
          username: 'riot',
          password: credentials.password,
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: 5000,
      });

      // Test connection with a simple API call
      const isConnected = await this.testConnection();
      if (!isConnected) {
        if (!auto && !this.autoConnectInterval) {
          this.emit('error', new Error('Failed to connect to League client'));
        }
        return false;
      }

      // Establish WebSocket connection
      await this.connectWebSocket();

      this.connected = true;
      this.emit('connected', credentials);

      // Start monitoring for client disconnection
      this.startPolling();

      const currentPhase = await this.getGameflowPhase();
      await this.handleGameflowPhase(currentPhase);

      return true;
    } catch {
      // Only emit error if not auto-connecting
      if (!auto && !this.autoConnectInterval) {
        this.emit('error', new Error('Failed to connect to League client'));
      }
      return false;
    }
  }

  disconnect(): void {
    this.stopPolling();
    this.stopMultiKillMonitoring();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.credentials = null;
    this.axiosInstance = null;
    this.activePlayerName = null;
    this.subscriptions.clear();

    this.emit('disconnected');
  }

  async subscribe(eventName: string): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = JSON.stringify([5, eventName]);

    this.ws.send(message);
    this.subscriptions.add(eventName);

    return true;
  }

  async unsubscribe(eventName: string): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = JSON.stringify([6, eventName]);
    this.ws.send(message);
    this.subscriptions.delete(eventName);

    return true;
  }

  async request(method: string, endpoint: string, data?: any): Promise<any> {
    if (!this.axiosInstance) {
      throw new Error('Not connected to LCU');
    }

    try {
      const response = await this.axiosInstance.request({
        method,
        url: endpoint,
        data,
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        const isChampSelectEndpoint = endpoint.includes('/lol-champ-select/');
        const isLiveClientEndpoint = endpoint.includes('/liveclientdata/');
        const is404Error = error.response.status === 404;

        if ((!isChampSelectEndpoint && !isLiveClientEndpoint) || !is404Error) {
          console.error(`LCU: HTTP ${error.response.status} for ${endpoint}:`, error.response.data);
        }

        const err: any = new Error(`LCU request failed: ${error.response.status}`);
        err.httpStatus = error.response.status;
        throw err;
      } else if (error.request) {
        console.error('LCU: No response from server:', error.message);
        throw new Error('No response from League client');
      } else {
        console.error('LCU: Request setup error:', error.message);
        throw error;
      }
    }
  }

  async getGameflowPhase(): Promise<string> {
    try {
      const phase = await this.request('GET', '/lol-gameflow/v1/gameflow-phase');
      return phase || 'None';
    } catch {
      return 'None';
    }
  }

  async getGameflowSession(): Promise<any> {
    try {
      const session = await this.request('GET', '/lol-gameflow/v1/session');
      return session;
    } catch {
      return null;
    }
  }

  async getChampSelectSession(): Promise<any> {
    try {
      return await this.request('GET', '/lol-champ-select/v1/session');
    } catch {
      return null;
    }
  }

  async getLobbySession(): Promise<any> {
    try {
      return await this.request('GET', '/lol-lobby/v2/lobby');
    } catch {
      return null;
    }
  }

  async performChampSelectAction(actionId: number, championId: number): Promise<any> {
    try {
      return await this.request('PATCH', `/lol-champ-select/v1/session/actions/${actionId}`, {
        championId,
        completed: true,
      });
    } catch (error) {
      console.error('[LCUConnector] Failed to perform champ select action:', error);
      throw error;
    }
  }

  async getOwnedChampions(): Promise<any> {
    try {
      return await this.request('GET', '/lol-champions/v1/owned-champions-minimal');
    } catch (error) {
      console.error('[LCUConnector] Failed to get owned champions:', error);
      return [];
    }
  }

  async getAllChampions(): Promise<any> {
    try {
      return await this.request('GET', '/lol-game-data/assets/v1/champion-summary.json');
    } catch (error) {
      console.error('[LCUConnector] Failed to get all champions:', error);
      return [];
    }
  }

  async getMatchmakingSearchState(): Promise<any> {
    try {
      return await this.request('GET', '/lol-lobby/v2/lobby/matchmaking/search-state');
    } catch {
      return null;
    }
  }

  async getLobbyData(): Promise<any> {
    try {
      return await this.request('GET', '/lol-lobby/v2/lobby');
    } catch {
      return null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.request('GET', '/lol-summoner/v1/current-summoner');
      return true;
    } catch {
      return false;
    }
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.credentials) {
      throw new Error('No credentials available');
    }

    const wsUrl = `wss://${this.credentials.address}:${this.credentials.port}/`;
    const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString(
      'base64'
    );

    this.ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      rejectUnauthorized: false,
    });

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        return reject(new Error('WebSocket not initialized'));
      }

      this.ws.on('open', () => {
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const messageStr = data.toString();
          // Skip empty messages
          if (!messageStr || messageStr.trim() === '') {
            return;
          }

          const message = JSON.parse(messageStr);
          if (Array.isArray(message) && message.length >= 3) {
            const [opcode, eventName, eventData] = message;
            if (opcode === 8 && eventName) {
              // Log champion select events
              if (eventName.includes('lol-champ-select')) {
                // Champion select event received
              }

              this.emit('event', eventName, eventData);

              // Emit specific events
              if (eventName === 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase') {
                const phase = eventData?.data;
                this.emit('gameflow-phase', phase);
                void this.handleGameflowPhase(phase);
              } else if (eventName === 'OnJsonApiEvent_lol-champ-select_v1_session') {
                this.emit('champ-select-session', eventData?.data);
              } else if (eventName === 'OnJsonApiEvent_lol-lobby_v2_lobby') {
                this.emit('lobby-session', eventData?.data);
              }
            }
          }
        } catch (error) {
          // Only log if it's not an empty message error
          if (error instanceof Error && error.message !== 'Unexpected end of JSON input') {
            console.error('Failed to parse WebSocket message:', error);
          }
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      });

      this.ws.on('close', () => {
        this.handleDisconnection();
      });
    });
  }

  private startPolling(): void {
    let lastHeartbeat = Date.now();

    // Track WebSocket activity
    if (this.ws) {
      this.ws.on('message', () => {
        lastHeartbeat = Date.now();
      });

      this.ws.on('ping', () => {
        lastHeartbeat = Date.now();
      });
    }

    // Only test if truly stale (10 seconds without activity)
    this.pollInterval = setInterval(async () => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;

      if (timeSinceLastHeartbeat > 10000) {
        // Only make HTTP call if WebSocket seems dead
        const connected = await this.testConnection();
        if (!connected) {
          this.handleDisconnection();
        }
      }
    }, 5000); // Check every 5s, but only HTTP call if stale
  }

  private async handleGameflowPhase(phase: string | null | undefined): Promise<void> {
    const normalizedPhase = phase || 'None';
    if (normalizedPhase === 'InProgress') {
      await this.startMultiKillMonitoring();
    } else {
      this.stopMultiKillMonitoring();
    }
  }

  private async startMultiKillMonitoring(): Promise<void> {
    if (!this.connected || this.multikillMonitoringActive) {
      return;
    }

    this.multikillMonitoringActive = true;
    this.multikillEventCursor = 0;
    this.lastMultiKillKey = null;
    this.activePlayerName = null;

    const poll = async () => {
      await this.pollMultiKillEvents();
    };

    await poll();
    this.multikillMonitorInterval = setInterval(poll, 300);
  }

  private stopMultiKillMonitoring(): void {
    this.multikillMonitoringActive = false;
    this.cachedLiveClientPort = null;
    this.activePlayerName = null;
    if (this.multikillMonitorInterval) {
      clearInterval(this.multikillMonitorInterval);
      this.multikillMonitorInterval = null;
    }
  }

  private isMultiKillEvent(event: any): boolean {
    if (!event || typeof event !== 'object') {
      return false;
    }

    const eventName = String(event.EventName ?? event.eventName ?? event.name ?? '').trim();
    const killStreak = Number(event.KillStreak ?? event.killStreak ?? event.killstreak ?? 0);

    if (!eventName || !/^multikill$/i.test(eventName)) {
      return false;
    }

    return killStreak >= 2 && killStreak <= 5;
  }

  /**
   * 获取当前控制的玩家名称 (Active Player)
   */
  private async getActivePlayerName(): Promise<string | null> {
    if (this.activePlayerName) {
      return this.activePlayerName;
    }

    try {
      const nameData = await this.requestLiveClientAPI('/liveclientdata/activeplayername');
      if (typeof nameData === 'string' && nameData.trim()) {
        // 清理双引号与多余空格
        this.activePlayerName = nameData.replace(/^"|"$/g, '').split('#')[0].trim();
        console.log(`[LCUConnector] Identified active player: "${this.activePlayerName}"`);
        LogMsgUtil.sendLogMsg(
          `[LCUConnector] Identified active player: "${this.activePlayerName}"`
        );
        return this.activePlayerName;
      }
    } catch (err: any) {
      // 可以在载入对局初期重试
    }
    return null;
  }

  private async handleMultiKillEvent(event: any): Promise<void> {
    const killerName = String(event?.KillerName ?? event?.killerName ?? '').trim();
    const killStreak = Number(event?.KillStreak ?? event?.killStreak ?? 0);

    // 1. 获取当前玩家名字，并校验击杀者是否为当前玩家
    const myPlayerName = await this.getActivePlayerName();
    if (!myPlayerName || !killerName) {
      return;
    }

    if (killerName.toLowerCase() !== myPlayerName.toLowerCase()) {
      LogMsgUtil.sendLogMsg(killerName.toLowerCase());
      return;
    }

    // 2. 防重复处理校验
    const eventName = String(event?.EventName ?? event?.eventName ?? 'multikill');
    const key = `${eventName}:${killStreak}:${killerName}:${
      event?.EventTime ?? event?.eventTime ?? ''
    }`;

    if (this.lastMultiKillKey === key) {
      return;
    }

    this.lastMultiKillKey = key;
    this.emit('multikill', event);

    // 根据连杀数量划分目录：2->doublekill, 3->triplekill, 4->quadrakill, 5->pentakill
    const killDirMap: Record<number, string> = {
      2: 'doublekill',
      3: 'triplekill',
      4: 'quadrakill',
      5: 'pentakill',
    };

    const subDir = killDirMap[killStreak] || 'multikill';
    const prefix = `${subDir}-${killStreak}kills`;

    // 连杀数越高，等待 UI 横幅完全展开并覆盖旧播报的时间越长（如 3 杀及以上等待 300ms）
    const uiRenderDelay = killStreak > 2 ? (killStreak > 4 ? 500 : 300) : 150;
    await new Promise((resolve) => setTimeout(resolve, uiRenderDelay));

    // 传入 prefix 和对应的子目录名称
    const file = await captureAppScreenshot(prefix, subDir);
    if (file) {
      this.emit('screenshot-created', file);
    }
  }

  private async requestLiveClientAPI(endpoint: string): Promise<any> {
    // 1. 如果已有缓存端口，优先尝试缓存端口
    if (this.cachedLiveClientPort !== null) {
      try {
        const res = await axios.get(`https://127.0.0.1:${this.cachedLiveClientPort}${endpoint}`, {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 1000,
        });
        return res.data;
      } catch (err: any) {
        // 缓存端口失效（端口变更或拒绝连接），清空缓存降级到端口扫描逻辑
        if (err.code === 'ECONNREFUSED' || err.response?.status === 404) {
          this.cachedLiveClientPort = null;
        } else {
          throw err;
        }
      }
    }

    // 2. 缓存为空或缓存端口请求失败，扫描候选端口
    const candidatePorts = [2999, 3000, 3001, 3002].filter(
      (p, idx, self) => self.indexOf(p) === idx
    );

    for (const port of candidatePorts) {
      try {
        const res = await axios.get(`https://127.0.0.1:${port}${endpoint}`, {
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 1000,
        });
        // 成功获取后，更新缓存的可用端口
        this.cachedLiveClientPort = port;
        LogMsgUtil.sendLogMsg(`LCU port${port}`);
        return res.data;
      } catch (err: any) {
        // 如果此端口无法连接或未准备好，重试下一个候选端口
        if (err.code === 'ECONNREFUSED' || err.response?.status === 404) {
          continue;
        }
        throw err;
      }
    }

    throw new Error('Live Client API connection refused on candidate ports');
  }

  private async pollMultiKillEvents(): Promise<void> {
    if (!this.connected || !this.multikillMonitoringActive) {
      return;
    }

    try {
      // 请求固定/动态映射的 2999 机制下的 Live Client API，避开 LCU 端口 404 问题
      const response = await this.requestLiveClientAPI('/liveclientdata/eventdata');
      const events = Array.isArray(response)
        ? response
        : Array.isArray(response?.Events)
        ? response.Events
        : Array.isArray(response?.events)
        ? response.events
        : [];

      if (!Array.isArray(events) || events.length === 0) {
        return;
      }

      for (const event of events.slice(this.multikillEventCursor)) {
        if (this.isMultiKillEvent(event)) {
          await this.handleMultiKillEvent(event);
          break;
        }
      }

      this.multikillEventCursor = events.length;
    } catch (error: any) {
      // 游戏仍处于载入画面或未初始化完毕时抛错，属于正常等待过程
      const httpStatus = error?.httpStatus ?? error?.response?.status;
      if (httpStatus === 404 || error.code === 'ECONNREFUSED') {
        LogMsgUtil.sendLogMsg('404 ECONNREFUSED');
        return;
      }

      console.warn('[LCUConnector] Failed to poll live client event data:', error.message || error);
      LogMsgUtil.sendLogMsg(
        '[LCUConnector] Failed to poll live client event data:',
        error.message || error
      );
    }
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private handleDisconnection(): void {
    const wasConnected = this.connected;
    this.disconnect();

    if (wasConnected) {
      // Attempt to reconnect
      setTimeout(() => {
        this.connect();
      }, 5000);
    }
  }

  // Start polling for League client
  startAutoConnect(interval = 5000): void {
    this.stopAutoConnect();

    // Try immediate connection
    this.connect(true);

    // Set up polling
    this.autoConnectInterval = setInterval(() => {
      if (!this.connected) {
        this.connect();
      }
    }, interval);
  }

  stopAutoConnect(): void {
    if (this.autoConnectInterval) {
      clearInterval(this.autoConnectInterval);
      this.autoConnectInterval = null;
    }
  }

  private autoConnectInterval: NodeJS.Timeout | null = null;
}

// Singleton instance
export const lcuConnector = new LCUConnector();
