import {
  calculatePidOutput,
  decideDutyCycle,
  decideHysteresis,
  isWithinSchedule,
  parseScheduleWindow,
  timeProportioning,
  Controller,
} from './controller';
import { HAClient } from './haClient';
import { MockHomeAssistant } from '../../test-support/mockHomeAssistant';

describe('decideHysteresis', () => {
  const now = new Date('2026-01-01T00:10:00Z');

  test('turns on below the minimum after the minimum off time', () => {
    expect(decideHysteresis({
      value: 49, min: 50, max: 60, isOn: false,
      lastChangeAt: new Date('2026-01-01T00:08:00Z'), now,
      minOnSeconds: 60, minOffSeconds: 60, direction: 'humidifier'
    })).toBe(true);
  });

  test('keeps the humidifier off inside the dead band', () => {
    expect(decideHysteresis({
      value: 55, min: 50, max: 60, isOn: false,
      lastChangeAt: new Date('2026-01-01T00:00:00Z'), now,
      minOnSeconds: 60, minOffSeconds: 60, direction: 'humidifier'
    })).toBe(false);
  });

  test('does not turn on until minimum off time has elapsed', () => {
    expect(decideHysteresis({
      value: 49, min: 50, max: 60, isOn: false,
      lastChangeAt: new Date('2026-01-01T00:09:30Z'), now,
      minOnSeconds: 60, minOffSeconds: 60, direction: 'humidifier'
    })).toBe(false);
  });

  test('turns off above the maximum after the minimum on time', () => {
    expect(decideHysteresis({
      value: 61, min: 50, max: 60, isOn: true,
      lastChangeAt: new Date('2026-01-01T00:08:00Z'), now,
      minOnSeconds: 60, minOffSeconds: 60, direction: 'humidifier'
    })).toBe(false);
  });

  test('does not turn off until minimum on time has elapsed', () => {
    expect(decideHysteresis({
      value: 61, min: 50, max: 60, isOn: true,
      lastChangeAt: new Date('2026-01-01T00:09:30Z'), now,
      minOnSeconds: 60, minOffSeconds: 60, direction: 'humidifier'
    })).toBe(true);
  });

  test('turns a dehumidifier on above the maximum and off below the minimum', () => {
    expect(decideHysteresis({
      value: 70, min: 50, max: 60, isOn: false, now,
      lastChangeAt: new Date('2026-01-01T00:08:00Z'),
      minOnSeconds: 60, minOffSeconds: 60, direction: 'dehumidifier'
    })).toBe(true);
    expect(decideHysteresis({
      value: 49, min: 50, max: 60, isOn: true, now,
      lastChangeAt: new Date('2026-01-01T00:08:00Z'),
      minOnSeconds: 60, minOffSeconds: 60, direction: 'dehumidifier'
    })).toBe(false);
  });
});

describe('controller schedules', () => {
  test('supports overnight schedule windows and duty cycles', () => {
    const window = parseScheduleWindow('22:00-06:00');
    expect(isWithinSchedule(23 * 60, window)).toBe(true);
    expect(isWithinSchedule(5 * 60 + 59, window)).toBe(true);
    expect(isWithinSchedule(12 * 60, window)).toBe(false);
    expect(decideDutyCycle(new Date('2026-01-01T00:07:00Z'), 10, 20)).toBe(true);
    expect(decideDutyCycle(new Date('2026-01-01T00:12:00Z'), 10, 20)).toBe(false);
  });

  describe('PID control', () => {
    test('calculates a bounded proportional output around the band midpoint', () => {
      expect(calculatePidOutput({
        measurement: 40,
        setpoint: 50,
        direction: 'humidifier',
        kp: 0.05,
        ki: 0,
        kd: 0,
        dtSeconds: 1,
        integral: 0,
        previousError: null,
      }).output).toBeCloseTo(0.5);
    });

    test('anti-windup keeps the integral from growing while saturated', () => {
      const result = calculatePidOutput({
        measurement: 0,
        setpoint: 100,
        direction: 'humidifier',
        kp: 1,
        ki: 1,
        kd: 0,
        dtSeconds: 10,
        integral: 20,
        previousError: 100,
      });
      expect(result.output).toBe(1);
      expect(result.integral).toBe(20);
    });

    test('time-proportions the PID output over a window and honors minimum on time', () => {
      const now = new Date('2026-01-01T00:00:10Z');
      expect(timeProportioning({
        output: 0.25,
        now,
        windowSeconds: 60,
        isOn: false,
        lastChangeAt: new Date('2026-01-01T00:00:00Z'),
        minOnSeconds: 0,
        minOffSeconds: 0,
      })).toBe(true);
      expect(timeProportioning({
        output: 0.25,
        now: new Date('2026-01-01T00:00:40Z'),
        windowSeconds: 60,
        isOn: true,
        lastChangeAt: new Date('2026-01-01T00:00:35Z'),
        minOnSeconds: 10,
        minOffSeconds: 0,
      })).toBe(true);
    });
  });
});

describe('Controller', () => {
  let server: MockHomeAssistant;
  let client: HAClient;

  afterEach(async () => {
    client?.stop();
    await server?.stop();
  });

  test('drives the humidifier and logs the action through mock HA', async () => {
    server = new MockHomeAssistant();
    const url = await server.start();
    client = new HAClient({ URL: url, TOKEN: 'test-token', RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    server.publishState({
      entity_id: 'sensor.humidity',
      state: '45',
      attributes: { unit_of_measurement: '%' },
      last_updated: '2026-01-01T00:02:00Z'
    } as any);
    server.publishState({
      entity_id: 'sensor.temperature',
      state: '25',
      attributes: { unit_of_measurement: '°C' },
      last_updated: '2026-01-01T00:02:00Z'
    } as any);
    server.publishState({
      entity_id: 'switch.humidifier',
      state: 'off',
      attributes: {},
      last_changed: '2026-01-01T00:00:00Z'
    } as any);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const actionLog = jest.fn();
    const controller = new Controller({
      haClient: client,
      database: {
        growArea: {
          findMany: jest.fn().mockResolvedValue([{
            id: 1,
            leafOffsetC: -2,
            plants: [{ phases: [{ name: 'Vegetation', humidityMin: 50, humidityMax: 60 }] }],
            sensorBindings: [
              { role: 'humidity', entityId: 'sensor.humidity' },
              { role: 'temperature', entityId: 'sensor.temperature' },
            ],
            actuatorBindings: [{
              role: 'humidifier',
              entityId: 'switch.humidifier',
              minOnSeconds: 60,
              minOffSeconds: 60,
              manual: false,
              manualUntil: null
            }],
            phaseSettings: [{ phaseName: 'Vegetation', vpdMin: 0.8, vpdMax: 1.2, humidityMin: 50, humidityMax: 60 }]
          }])
        },
        actionLog: { create: actionLog }
      } as any,
      clock: () => new Date('2026-01-01T00:02:00Z')
    });

    await controller.tick();

    expect(server.services).toEqual([{
      domain: 'homeassistant',
      service: 'turn_on',
      data: { entity_id: 'switch.humidifier' }
    }]);
    expect(actionLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'controller',
        action: 'on',
        reason: expect.stringContaining('VPD 1.38 kPa'),
      })
    }));
  });

  test('controls a plantless area using its configured control phase', async () => {
    server = new MockHomeAssistant();
    const url = await server.start();
    client = new HAClient({ URL: url, TOKEN: 'test-token', RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const at = '2026-01-01T00:02:00Z';
    for (const state of [
      { entity_id: 'sensor.humidity', state: '45', attributes: {}, last_updated: at },
      { entity_id: 'switch.humidifier', state: 'off', attributes: {}, last_changed: '2026-01-01T00:00:00Z' },
    ]) server.publishState(state as any);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const controller = new Controller({
      haClient: client,
      database: {
        growArea: { findMany: jest.fn().mockResolvedValue([{
          id: 1, controlPhaseName: 'Vegetation', plants: [],
          sensorBindings: [{ role: 'humidity', entityId: 'sensor.humidity' }],
          actuatorBindings: [{
            role: 'humidifier', entityId: 'switch.humidifier', minOnSeconds: 0, minOffSeconds: 0,
            manual: false, manualUntil: null,
          }],
          phaseSettings: [{ phaseName: 'Vegetation', humidityMin: 50, humidityMax: 60 }],
        }]) },
        actionLog: { create: jest.fn() },
      } as any,
      clock: () => new Date(at),
    });

    await controller.tick();

    expect(server.services).toContainEqual({
      domain: 'homeassistant', service: 'turn_on', data: { entity_id: 'switch.humidifier' },
    });
  });

  test('does not control a plantless area without a control phase', async () => {
    server = new MockHomeAssistant();
    const url = await server.start();
    client = new HAClient({ URL: url, TOKEN: 'test-token', RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const at = '2026-01-01T00:02:00Z';
    server.publishState({ entity_id: 'sensor.humidity', state: '45', attributes: {}, last_updated: at } as any);
    server.publishState({ entity_id: 'switch.humidifier', state: 'off', attributes: {}, last_changed: at } as any);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const findMany = jest.fn().mockResolvedValue([]);
    const controller = new Controller({
      haClient: client,
      database: { growArea: { findMany }, actionLog: { create: jest.fn() } } as any,
      clock: () => new Date(at),
    });

    await controller.tick();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ controlPhaseName: { not: null } }]),
      }),
    }));
    expect(server.services).toEqual([]);
  });

  test('uses climate attributes for staged ventilation control', async () => {
    server = new MockHomeAssistant();
    const url = await server.start();
    client = new HAClient({ URL: url, TOKEN: 'test-token', RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const at = '2026-01-01T00:02:00Z';
    for (const state of [
      { entity_id: 'sensor.humidity', state: '70', attributes: {}, last_updated: at },
      { entity_id: 'sensor.temperature', state: '28', attributes: {}, last_updated: at },
      { entity_id: 'climate.room', state: 'off', attributes: { current_temperature: 20, current_humidity: 40 }, last_updated: at },
      { entity_id: 'switch.ventilation', state: 'off', attributes: {}, last_updated: at },
    ]) server.publishState(state as any);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const controller = new Controller({
      haClient: client,
      database: {
        growArea: { findMany: jest.fn().mockResolvedValue([{
          id: 1, roomClimateEntityId: 'climate.room',
          plants: [{ phases: [{ name: 'Vegetation', humidityMin: 50, humidityMax: 60 }] }],
          sensorBindings: [{ role: 'humidity', entityId: 'sensor.humidity' }, { role: 'temperature', entityId: 'sensor.temperature' }],
          actuatorBindings: [{ role: 'ventilation', entityId: 'switch.ventilation', manual: false, manualUntil: null, minOnSeconds: 0, minOffSeconds: 0 }],
          phaseSettings: [{ phaseName: 'Vegetation', tempMin: 22, tempMax: 26, humidityMin: 50, humidityMax: 60 }],
        }]) },
        actionLog: { create: jest.fn() },
      } as any,
      clock: () => new Date(at),
    });
    await controller.tick();
    expect(server.services).toContainEqual({
      domain: 'homeassistant', service: 'turn_on', data: { entity_id: 'switch.ventilation' },
    });
  });

  test('drives a PID humidifier through mock HA time-proportioning', async () => {
    server = new MockHomeAssistant();
    const url = await server.start();
    client = new HAClient({ URL: url, TOKEN: 'test-token', RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const at = '2026-01-01T00:00:00Z';
    for (const state of [
      { entity_id: 'sensor.humidity', state: '45', attributes: {}, last_updated: at },
      { entity_id: 'switch.humidifier', state: 'off', attributes: {}, last_changed: at },
    ]) server.publishState(state as any);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const callService = jest.fn().mockResolvedValue(undefined);
    const controller = new Controller({
      haClient: { listEntities: () => client.listEntities(), callService } as any,
      database: {
        growArea: { findMany: jest.fn().mockResolvedValue([{
          id: 1,
          plants: [{ phases: [{ name: 'Vegetation', humidityMin: 50, humidityMax: 60 }] }],
          sensorBindings: [{ role: 'humidity', entityId: 'sensor.humidity' }],
          actuatorBindings: [{
            id: 4, role: 'humidifier', entityId: 'switch.humidifier', algorithm: 'pid',
            kp: 0.1, ki: 0, kd: 0, windowSeconds: 60,
            minOnSeconds: 0, minOffSeconds: 0, manual: false, manualUntil: null,
          }],
          phaseSettings: [],
        }]) },
        actionLog: { create: jest.fn() },
      } as any,
      clock: () => new Date(at),
    });

    await controller.tick();
    expect(callService).toHaveBeenCalledWith('homeassistant', 'turn_on', { entity_id: 'switch.humidifier' });
  });

  test('drives multiple scheduled and environmental actuators in one area', async () => {
    server = new MockHomeAssistant();
    const url = await server.start();
    client = new HAClient({ URL: url, TOKEN: 'test-token', RECONNECT_BASE_MS: 10, RECONNECT_MAX_MS: 20 });
    client.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const at = '2026-01-01T10:00:00Z';
    for (const state of [
      { entity_id: 'sensor.humidity', state: '75', attributes: {}, last_updated: at },
      { entity_id: 'sensor.temperature', state: '30', attributes: {}, last_updated: at },
      { entity_id: 'switch.humidifier', state: 'off', attributes: {}, last_changed: at },
      { entity_id: 'switch.dehumidifier', state: 'off', attributes: {}, last_changed: at },
      { entity_id: 'switch.ventilation', state: 'off', attributes: {}, last_changed: at },
      { entity_id: 'switch.light', state: 'off', attributes: {}, last_changed: at },
      { entity_id: 'switch.fan', state: 'off', attributes: {}, last_changed: at },
    ]) server.publishState(state as any);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const actionLog = jest.fn();
    const binding = (role: string, entityId: string) => ({
      role, entityId, minOnSeconds: 0, minOffSeconds: 0, manual: false, manualUntil: null
    });
    const controller = new Controller({
      haClient: client,
      database: {
        growArea: { findMany: jest.fn().mockResolvedValue([{
          id: 1,
          leafOffsetC: -2,
          plants: [{ phases: [{
            name: 'Vegetation', startDate: new Date('2026-01-01T00:00:00Z'),
            humidityMin: 50, humidityMax: 60, tempMin: 20, tempMax: 26, lightOnHours: 18
          }] }],
          sensorBindings: [
            { role: 'humidity', entityId: 'sensor.humidity' },
            { role: 'temperature', entityId: 'sensor.temperature' },
          ],
          actuatorBindings: [
            binding('humidifier', 'switch.humidifier'),
            binding('dehumidifier', 'switch.dehumidifier'),
            binding('ventilation', 'switch.ventilation'),
            binding('light', 'switch.light'),
            binding('fan', 'switch.fan'),
          ],
          phaseSettings: [{
            phaseName: 'Vegetation', humidityMin: 50, humidityMax: 60,
            tempMin: 20, tempMax: 26, lightOnTime: '08:00', lightOffTime: '12:00',
            fanSchedule: '08:00-12:00'
          }]
        }]) },
        actionLog: { create: actionLog }
      } as any,
      clock: () => new Date(at)
    });

    await controller.tick();

    expect(server.services.map((service) => service.data.entity_id)).toEqual(expect.arrayContaining([
      'switch.dehumidifier', 'switch.ventilation', 'switch.light', 'switch.fan'
    ]));
    expect(server.services).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ data: { entity_id: 'switch.humidifier' } })
    ]));
    expect(actionLog).toHaveBeenCalledTimes(4);
  });

  test('does not act on an unconfigured area', async () => {
    const callService = jest.fn();
    const controller = new Controller({
      haClient: {
        listEntities: async () => [],
        callService
      } as any,
      database: {
        growArea: { findMany: jest.fn().mockResolvedValue([]) },
        actionLog: { create: jest.fn() }
      } as any,
      clock: () => new Date('2026-01-01T00:00:00Z')
    });

    await controller.tick();
    expect(callService).not.toHaveBeenCalled();
  });

    test('uses the VPD-derived humidity band and logs the measured VPD', async () => {
      const callService = jest.fn().mockResolvedValue(undefined);
      const actionLog = jest.fn();
      const controller = new Controller({
        haClient: {
          listEntities: async () => [
            { entity_id: 'sensor.humidity', state: '45', attributes: {}, last_updated: '2026-01-01T00:02:00Z' },
            { entity_id: 'sensor.temperature', state: '25', attributes: {}, last_updated: '2026-01-01T00:02:00Z' },
            { entity_id: 'switch.humidifier', state: 'off', attributes: {}, last_changed: '2026-01-01T00:00:00Z' },
          ],
          callService,
        } as any,
        database: {
          growArea: { findMany: jest.fn().mockResolvedValue([{
            id: 1,
            leafOffsetC: -2,
            plants: [{ phases: [{ name: 'Vegetation', humidityMin: 40, humidityMax: 80 }] }],
            sensorBindings: [
              { role: 'humidity', entityId: 'sensor.humidity' },
              { role: 'temperature', entityId: 'sensor.temperature' },
            ],
            actuatorBindings: [{
              role: 'humidifier', entityId: 'switch.humidifier',
              minOnSeconds: 60, minOffSeconds: 60, manual: false, manualUntil: null,
            }],
            phaseSettings: [{ phaseName: 'Vegetation', vpdMin: 0.8, vpdMax: 1.2, humidityMin: 40, humidityMax: 80 }],
          }]) },
          actionLog: { create: actionLog },
        } as any,
        clock: () => new Date('2026-01-01T00:02:00Z'),
      });

      await controller.tick();

      expect(callService).toHaveBeenCalledWith('homeassistant', 'turn_on', { entity_id: 'switch.humidifier' });
      expect(actionLog).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ reason: expect.stringContaining('VPD 1.38 kPa') }),
      }));
    });

  test('applies and logs a fail-safe once while the sensor is stale, then resumes after recovery', async () => {
    const callService = jest.fn().mockResolvedValue(undefined);
    const actionLog = jest.fn();
    const area = {
      id: 1,
      plants: [{ phases: [{ name: 'Vegetation', humidityMin: 50, humidityMax: 60 }] }],
      sensorBindings: [{ role: 'humidity', entityId: 'sensor.humidity' }],
      actuatorBindings: [{
        id: 2, role: 'humidifier', entityId: 'switch.humidifier', failSafe: 'off',
        minOnSeconds: 60, minOffSeconds: 60, manual: false, manualUntil: null
      }],
      phaseSettings: []
    };
    let states = [{
      entity_id: 'sensor.humidity', state: '45', attributes: {},
      last_updated: '2025-12-31T23:00:00Z'
    }, {
      entity_id: 'switch.humidifier', state: 'on', attributes: {}
    }] as any;
    const controller = new Controller({
      haClient: { listEntities: async () => states, callService } as any,
      database: { growArea: { findMany: jest.fn().mockResolvedValue([area]) }, actionLog: { create: actionLog } } as any,
      clock: () => new Date('2026-01-01T00:00:00Z')
    });

    await controller.tick();
    await controller.tick();
    expect(callService).toHaveBeenCalledTimes(1);
    expect(actionLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'failsafe', action: 'off' })
    }));

    states = [{ ...states[0], last_updated: '2026-01-01T00:00:00Z' }, { ...states[1], state: 'off' }];
    await controller.tick();
    expect(callService).toHaveBeenCalledTimes(2);
  });

  test('clears expired manual mode and logs expiry without applying a fail-safe', async () => {
    const actionLog = jest.fn();
    const update = jest.fn().mockResolvedValue(undefined);
    const area = {
      id: 1,
      plants: [{ phases: [{ name: 'Vegetation', humidityMin: 50, humidityMax: 60 }] }],
      sensorBindings: [{ role: 'humidity', entityId: 'sensor.humidity' }],
      actuatorBindings: [{
        id: 2, role: 'humidifier', entityId: 'switch.humidifier', failSafe: 'off',
        minOnSeconds: 60, minOffSeconds: 60, manual: true,
        manualUntil: new Date('2025-12-31T23:59:00Z')
      }],
      phaseSettings: []
    };
    const controller = new Controller({
      haClient: {
        listEntities: async () => [
          { entity_id: 'sensor.humidity', state: '55', attributes: {}, last_updated: '2026-01-01T00:00:00Z' },
          { entity_id: 'switch.humidifier', state: 'off', attributes: {} }
        ],
        callService: jest.fn()
      } as any,
      database: {
        growArea: { findMany: jest.fn().mockResolvedValue([area]) },
        actionLog: { create: actionLog },
        areaActuatorBinding: { update }
      } as any,
      clock: () => new Date('2026-01-01T00:00:00Z')
    });

    await controller.tick();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { manual: false, manualUntil: null } }));
    expect(actionLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'manual-expired' })
    }));
  });

  test('uses helpful room air for ventilation before stage two conditioning', async () => {
    const callService = jest.fn().mockResolvedValue(undefined);
    const actionLog = jest.fn();
    const at = new Date('2026-01-01T00:00:00Z');
    const controller = new Controller({
      haClient: {
        listEntities: async () => [
          { entity_id: 'sensor.temp', state: '30', attributes: {}, last_updated: at.toISOString() },
          { entity_id: 'sensor.rh', state: '55', attributes: {}, last_updated: at.toISOString() },
          { entity_id: 'sensor.room_temp', state: '20', attributes: {}, last_updated: at.toISOString() },
          { entity_id: 'sensor.room_rh', state: '50', attributes: {}, last_updated: at.toISOString() },
          { entity_id: 'switch.vent', state: 'off', attributes: {}, last_changed: at.toISOString() },
          { entity_id: 'fan.vent', state: 'off', attributes: { percentage: 0 }, last_changed: at.toISOString() },
          { entity_id: 'switch.dehum', state: 'off', attributes: {}, last_changed: at.toISOString() },
        ] as any,
        callService,
      } as any,
      database: {
        growArea: { findMany: jest.fn().mockResolvedValue([{
          id: 1,
          plants: [{ phases: [{ name: 'Vegetation', tempMin: 22, tempMax: 28, humidityMin: 45, humidityMax: 65 }] }],
          sensorBindings: [
            { role: 'temperature', entityId: 'sensor.temp' },
            { role: 'humidity', entityId: 'sensor.rh' },
            { role: 'roomTemperature', entityId: 'sensor.room_temp' },
            { role: 'roomHumidity', entityId: 'sensor.room_rh' },
          ],
          actuatorBindings: [
            { role: 'ventilation', entityId: 'switch.vent', speedEntityId: 'fan.vent', minOnSeconds: 0, minOffSeconds: 0, manual: false },
            { role: 'dehumidifier', entityId: 'switch.dehum', minOnSeconds: 0, minOffSeconds: 0, manual: false },
          ],
          phaseSettings: [],
        }]) },
        actionLog: { create: actionLog },
      } as any,
      clock: () => at,
    });

    await controller.tick();

    expect(callService).toHaveBeenCalledWith('fan', 'set_percentage', expect.objectContaining({
      entity_id: 'fan.vent',
    }));
    expect(callService).not.toHaveBeenCalledWith('homeassistant', 'turn_on', { entity_id: 'switch.dehum' });
  });

  test('clamps ventilation speed to the binding range for high and low demand', async () => {
    const callService = jest.fn().mockResolvedValue(undefined);
    const at = '2026-01-01T00:00:00Z';
    const states = [
      { entity_id: 'sensor.temp', state: '35', attributes: {}, last_updated: at },
      { entity_id: 'sensor.rh', state: '70', attributes: {}, last_updated: at },
      { entity_id: 'sensor.room_temp', state: '20', attributes: {}, last_updated: at },
      { entity_id: 'sensor.room_rh', state: '40', attributes: {}, last_updated: at },
      { entity_id: 'switch.vent', state: 'off', attributes: {}, last_changed: at },
      { entity_id: 'fan.vent', state: 'off', attributes: { percentage: 0 }, last_changed: at },
    ] as any[];
    const controller = new Controller({
      haClient: { listEntities: async () => states, callService } as any,
      database: {
        growArea: { findMany: jest.fn().mockResolvedValue([{
          id: 1,
          plants: [{ phases: [{ name: 'Vegetation', tempMin: 22, tempMax: 28, humidityMin: 45, humidityMax: 65 }] }],
          sensorBindings: [
            { role: 'temperature', entityId: 'sensor.temp' },
            { role: 'humidity', entityId: 'sensor.rh' },
            { role: 'roomTemperature', entityId: 'sensor.room_temp' },
            { role: 'roomHumidity', entityId: 'sensor.room_rh' },
          ],
          actuatorBindings: [{
            role: 'ventilation', entityId: 'switch.vent', speedEntityId: 'fan.vent',
            maxSpeedPercent: 60, minOnSeconds: 0, minOffSeconds: 0,
            manual: false, manualUntil: null,
          }],
          phaseSettings: [],
        }]) },
        actionLog: { create: jest.fn() },
      } as any,
      clock: () => new Date(at),
    });

    await controller.tick();
    expect(callService).toHaveBeenCalledWith('fan', 'set_percentage', {
      entity_id: 'fan.vent', percentage: 60,
    });

    states[0] = { ...states[0], state: '28.1' };
    states[1] = { ...states[1], state: '65.1' };
    states[4] = { ...states[4], state: 'on' };
    states[5] = { ...states[5], state: 'on', attributes: { percentage: 60 } };
    await controller.tick();
    expect(callService).toHaveBeenCalledWith('fan', 'set_percentage', {
      entity_id: 'fan.vent', percentage: 16,
    });
  });
});
