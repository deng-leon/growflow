import { buildLiveReadings } from './areaSensorController';

describe('area sensor live readings', () => {
  test('returns a numeric value, unit, and fresh status from a cached HA state', () => {
    const readings = buildLiveReadings(
      [
        { role: 'temperature', entityId: 'sensor.temp' },
        { role: 'humidity', entityId: 'sensor.humidity' },
      ],
      [
        {
          entity_id: 'sensor.temp',
          state: '23.4',
          attributes: { unit_of_measurement: '°C' },
          last_updated: new Date().toISOString(),
        },
        {
          entity_id: 'sensor.humidity',
          state: 'unavailable',
          attributes: { unit_of_measurement: '%' },
          last_updated: new Date().toISOString(),
        },
      ],
    );

    expect(readings).toEqual([
      expect.objectContaining({ role: 'temperature', value: 23.4, unit: '°C', stale: false }),
      expect.objectContaining({ role: 'humidity', value: null, unit: '%', stale: true }),
    ]);
  });
});
