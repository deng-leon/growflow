import http from 'http';
import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';

export class MockHomeAssistant {
  private server?: http.Server;
  private wss?: WebSocketServer;
  private sockets = new Set<WebSocket>();
  private states: Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }> = [
    { entity_id: 'sensor.temperature', state: '22', attributes: { unit_of_measurement: '°C' } }
  ];
  readonly services: Array<{ domain: string; service: string; data: Record<string, unknown> }> = [];
  private readonly history = new Map<string, Array<{ entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string }>>();

  async start(): Promise<string> {
    this.server = http.createServer((request, response) => {
      if (request.url === '/api/states') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(this.states));
        return;
      }
      if (request.url?.startsWith('/api/history/period')) {
        const query = new URL(request.url, 'http://localhost').searchParams;
        const entityId = query.get('filter_entity_id') || '';
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify([this.history.get(entityId) || []]));
        return;
      }
      if (request.url?.startsWith('/api/services/')) {
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => {
          const servicePath = request.url!.split('/services/')[1] || '';
          const [domain, service] = servicePath.split('/');
          const data = body ? JSON.parse(body) : {};
          this.services.push({ domain, service, data });
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(this.states));
        });
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.send(JSON.stringify({ type: 'auth_required' }));
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'auth') socket.send(JSON.stringify({ type: 'auth_ok', id: message.id }));
      });
      socket.on('close', () => this.sockets.delete(socket));
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  publishState(state: typeof this.states[number]): void {
    this.states = [state, ...this.states.filter((item) => item.entity_id !== state.entity_id)];
    const message = JSON.stringify({
      type: 'event',
      event: { data: { new_state: state } }
    });
    this.sockets.forEach((socket) => socket.send(message));
  }

  publishHistory(entityId: string, entries: Array<{ state: string; at: string }>): void {
    this.history.set(entityId, entries.map((entry) => ({
      entity_id: entityId,
      state: entry.state,
      attributes: {},
      last_changed: entry.at,
    })));
  }

  async stop(): Promise<void> {
    this.sockets.forEach((socket) => socket.close());
    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}
