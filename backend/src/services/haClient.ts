import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { CONFIG } from '../config/settings';

export type HAConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface HAStatus {
  status: HAConnectionStatus;
  configured: boolean;
  entities: number;
}

export interface HAHistoryEntry extends HAState {
  last_changed: string;
}

type HAConfig = Partial<typeof CONFIG.HOME_ASSISTANT> & Pick<typeof CONFIG.HOME_ASSISTANT, 'RECONNECT_BASE_MS' | 'RECONNECT_MAX_MS'>;

export class HAClient {
  private socket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private messageId = 1;
  private status: HAConnectionStatus = 'disconnected';
  private readonly states = new Map<string, HAState>();
  private readonly pending = new Map<number, (result: any) => void>();
  private readonly rest: AxiosInstance;

  constructor(private readonly config: HAConfig = CONFIG.HOME_ASSISTANT) {
    const baseURL = config.SUPERVISOR_TOKEN
      ? 'http://supervisor/core/api'
      : config.URL ? `${config.URL.replace(/\/$/, '')}/api` : undefined;
    this.rest = axios.create({
      baseURL,
      headers: config.SUPERVISOR_TOKEN
        ? { Authorization: `Bearer ${config.SUPERVISOR_TOKEN}` }
        : config.TOKEN ? { Authorization: `Bearer ${config.TOKEN}` } : undefined
    });
  }

  start(): void {
    if (this.status === 'connecting' || this.status === 'connected') return;
    const wsUrl = this.config.SUPERVISOR_TOKEN
      ? 'ws://supervisor/core/websocket'
      : this.config.URL ? this.config.URL.replace(/^http/, 'ws').replace(/\/$/, '') + '/api/websocket' : undefined;
    if (!wsUrl || !(this.config.SUPERVISOR_TOKEN || this.config.TOKEN)) return;
    this.status = 'connecting';
    this.socket = new WebSocket(wsUrl);
    this.socket.on('message', (raw) => this.handleMessage(JSON.parse(raw.toString())));
    this.socket.on('open', () => undefined);
    this.socket.on('close', () => this.handleDisconnect());
    this.socket.on('error', () => this.handleDisconnect());
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.close();
    this.socket = undefined;
    this.status = 'disconnected';
  }

  getStatus(): HAStatus {
    return {
      status: this.status,
      configured: Boolean(this.config.SUPERVISOR_TOKEN || (this.config.URL && this.config.TOKEN)),
      entities: this.states.size
    };
  }

  async listEntities(): Promise<HAState[]> {
    if (this.states.size || !this.rest.defaults.baseURL) return [...this.states.values()];
    const response = await this.rest.get<HAState[]>('/states');
    response.data.forEach((state) => this.states.set(state.entity_id, state));
    return response.data;
  }

  async callService(domain: string, service: string, data: Record<string, unknown> = {}): Promise<unknown> {
    const response = await this.rest.post(`/services/${domain}/${service}`, data);
    return response.data;
  }

  async getHistory(entityId: string, from: Date, to?: Date): Promise<HAHistoryEntry[]> {
    if (!this.rest.defaults.baseURL) return [];
    const response = await this.rest.get<HAHistoryEntry[][]>('/history/period', {
      params: {
        filter_entity_id: entityId,
        start_time: from.toISOString(),
        ...(to ? { end_time: to.toISOString() } : {}),
        minimal_response: 'true'
      }
    });
    return response.data?.[0] || [];
  }

  private handleMessage(message: any): void {
    if (message.type === 'auth_required') {
      this.socket?.send(JSON.stringify({ type: 'auth', access_token: this.config.SUPERVISOR_TOKEN || this.config.TOKEN }));
    } else if (message.type === 'auth_ok') {
      this.status = 'connected';
      this.reconnectAttempt = 0;
      this.send({ type: 'subscribe_events', event_type: 'state_changed' });
      this.listEntities().catch(() => undefined);
    } else if (message.type === 'event' && message.event?.data?.new_state) {
      const state = message.event.data.new_state as HAState;
      this.states.set(state.entity_id, state);
    } else if (message.id && this.pending.has(message.id)) {
      this.pending.get(message.id)?.(message);
      this.pending.delete(message.id);
    }
  }

  private send(message: Record<string, unknown>): void {
    this.socket?.send(JSON.stringify({ id: this.messageId++, ...message }));
  }

  private handleDisconnect(): void {
    if (this.status === 'disconnected') return;
    this.status = 'disconnected';
    const delay = Math.min(
      this.config.RECONNECT_BASE_MS * 2 ** this.reconnectAttempt++,
      this.config.RECONNECT_MAX_MS
    );
    this.reconnectTimer = setTimeout(() => this.start(), delay);
  }
}

export const haClient = new HAClient();
haClient.start();
