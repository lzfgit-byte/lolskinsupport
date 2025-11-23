import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import WebSocket from 'ws';
import { app } from 'electron';
import axios from 'axios';
import { getLockfile } from './connect-league-legends';

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
  private subscriptions: Set<string> = new Set();
  private axiosInstance: any = null;
  private readonly lockfileCacheDuration = 30000; // 30 seconds

  constructor(options: LCUConnectionOptions = {}) {
    super();
    // Options currently not used but kept for future extensibility
    void options;
  }

  async connect(): Promise<boolean> {
    try {
      // Try to find and read the lockfile
      const credentials = getLockfile();
      if (!credentials) {
        // Don't emit error for auto-connect attempts
        if (!this.autoConnectInterval) {
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
        if (!this.autoConnectInterval) {
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

      return true;
    } catch {
      // Only emit error if not auto-connecting
      if (!this.autoConnectInterval) {
        this.emit('error', new Error('Failed to connect to League client'));
      }
      return false;
    }
  }

  disconnect(): void {
    this.stopPolling();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.credentials = null;
    this.axiosInstance = null;
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
        // Suppress 404 errors for champ-select endpoint as they're expected when not in champ select
        const isChampSelectEndpoint = endpoint.includes('/lol-champ-select/');
        const is404Error = error.response.status === 404;

        if (!isChampSelectEndpoint || !is404Error) {
          console.error(`LCU: HTTP ${error.response.status} for ${endpoint}:`, error.response.data);
        }

        // Include httpStatus in the error for easier handling
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
                this.emit('gameflow-phase', eventData?.data);
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
    this.connect();

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
