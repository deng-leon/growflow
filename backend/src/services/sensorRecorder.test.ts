import { SensorRecorder } from './sensorRecorder';

describe('SensorRecorder', () => {
  test('records numeric values for every bound sensor and prunes old readings', async () => {
    const create = jest.fn().mockResolvedValue({});
    const deleteMany = jest.fn().mockResolvedValue({});
    const database = {
      areaSensorBinding: { findMany: jest.fn().mockResolvedValue([
        { areaId: 1, role: 'temperature', entityId: 'sensor.temp' },
        { areaId: 1, role: 'humidity', entityId: 'sensor.humidity' },
      ]) },
      sensorReading: { create, deleteMany },
    };
    const now = new Date('2026-01-01T00:01:00Z');
    const recorder = new SensorRecorder({
      database: database as any,
      haClient: {
        listEntities: jest.fn().mockResolvedValue([
          { entity_id: 'sensor.temp', state: '24.5', attributes: {} },
          { entity_id: 'sensor.humidity', state: '55', attributes: {} },
        ]),
      } as any,
      clock: () => now,
      retentionDays: 180,
    });

    await recorder.recordNow();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({ data: {
      areaId: 1, role: 'temperature', value: 24.5, at: now,
    } });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { at: { lt: new Date('2025-07-05T00:01:00Z') } },
    });
  });
});
