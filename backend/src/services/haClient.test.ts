import { HAClient } from './haClient';
import { MockHomeAssistant } from '../../test-support/mockHomeAssistant';

describe('HAClient', () => {
  let server: MockHomeAssistant;
  let url: string;
  const clients: HAClient[] = [];

  beforeEach(async () => {
    server = new MockHomeAssistant();
    url = await server.start();
  });

  afterEach(async () => {
    clients.forEach((client) => client.stop());
    await server.stop();
  });

  test('authenticates, subscribes, and caches state changes', async () => {
    const client = new HAClient({
      URL: url,
      TOKEN: 'test-token',
      RECONNECT_BASE_MS: 10,
      RECONNECT_MAX_MS: 20
    });
    clients.push(client);
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    server.publishState({ entity_id: 'sensor.humidity', state: '55', attributes: {} });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(client.getStatus().status).toBe('connected');
    expect((await client.listEntities()).map((state) => state.entity_id)).toContain('sensor.humidity');
  });

  test('lists entities and calls services over REST', async () => {
    const client = new HAClient({ URL: url, TOKEN: 'test-token', RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    clients.push(client);
    expect(await client.listEntities()).toHaveLength(1);
    await client.callService('light', 'turn_on', { entity_id: 'light.grow' });
    expect(server.services).toEqual([{
      domain: 'light',
      service: 'turn_on',
      data: { entity_id: 'light.grow' }
    }]);
  });

  test('loads entity history over REST', async () => {
    server.publishHistory('sensor.humidity', [{ state: '55', at: '2026-01-01T00:00:00Z' }]);
    const client = new HAClient({ URL: url, TOKEN: 'test-token', RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    clients.push(client);
    await expect(client.getHistory(
      'sensor.humidity',
      new Date('2026-01-01T00:00:00Z'),
    )).resolves.toEqual([expect.objectContaining({
      entity_id: 'sensor.humidity',
      state: '55',
      last_changed: '2026-01-01T00:00:00Z',
    })]);
  });

  test('returns empty results without requests when Home Assistant is not configured', async () => {
    const client = new HAClient({ RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    clients.push(client);
    await expect(client.listEntities()).resolves.toEqual([]);
    await expect(client.getHistory('sensor.humidity', new Date())).resolves.toEqual([]);
  });
});
