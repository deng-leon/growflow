import { CONFIG } from '../config/settings';
import { prisma } from '../database';
import { HAClient, haClient, HAState } from './haClient';
import { AreaSensorRole } from '@prisma/client';
import { extractClimateReadings } from '../utils/climate';

type Clock = () => Date;
type Database = typeof prisma;

export interface SensorRecorderOptions {
  database?: Database;
  haClient?: Pick<HAClient, 'listEntities' | 'getHistory'>;
  clock?: Clock;
  intervalMs?: number;
  retentionDays?: number;
}

export class SensorRecorder {
  private timer?: NodeJS.Timeout;
  private readonly database: Database;
  private readonly haClient: Pick<HAClient, 'listEntities' | 'getHistory'>;
  private readonly clock: Clock;
  private readonly intervalMs: number;
  private readonly retentionDays: number;

  constructor(options: SensorRecorderOptions = {}) {
    this.database = options.database || prisma;
    this.haClient = options.haClient || haClient;
    this.clock = options.clock || (() => new Date());
    this.intervalMs = options.intervalMs || CONFIG.RECORDER.INTERVAL_MS;
    this.retentionDays = options.retentionDays ?? CONFIG.RECORDER.RETENTION_DAYS;
  }

  start(): void {
    if (this.timer) return;
    const run = () => this.recordNow().catch((error) => console.error('Sensor recorder failed:', error instanceof Error ? error.message : error));
    void run();
    this.timer = setInterval(() => void run(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async recordNow(): Promise<void> {
    const [bindings, areas, states] = await Promise.all([
      this.database.areaSensorBinding.findMany(),
      this.database.growArea?.findMany
        ? this.database.growArea.findMany({ select: { id: true, roomClimateEntityId: true } })
        : Promise.resolve([]),
      this.haClient.listEntities(),
    ]);
    const stateByEntity = new Map(states.map((state) => [state.entity_id, state]));
    const at = this.clock();
    await Promise.all(bindings.map(async (binding) => {
      const state = stateByEntity.get(binding.entityId);
      const value = state ? Number(state.state) : NaN;
      if (!Number.isFinite(value)) return;
      await this.database.sensorReading.create({
        data: { areaId: binding.areaId, role: binding.role, value, at },
      });
    }));
    await Promise.all(areas.filter((area) => area.roomClimateEntityId).flatMap((area) => {
      const state = stateByEntity.get(area.roomClimateEntityId!);
      const updatedAt = state?.last_updated || state?.last_changed;
      const stale = !state || !updatedAt
        || at.getTime() - new Date(updatedAt).getTime() > CONFIG.CONTROLLER.STALE_AFTER_MS;
      const readings = stale ? { temperature: null, humidity: null } : extractClimateReadings(state);
      return ([
        ["roomTemperature", readings.temperature],
        ["roomHumidity", readings.humidity],
      ] as const).flatMap(([role, value]) => value === null ? [] : [
        this.database.sensorReading.create({ data: { areaId: area.id, role, value, at } }),
      ]);
    }));
    const cutoff = new Date(at.getTime() - this.retentionDays * 24 * 60 * 60 * 1000);
    await this.database.sensorReading.deleteMany({ where: { at: { lt: cutoff } } });
  }

  async backfillSensor(
    areaId: number,
    role: string,
    entityId: string,
    from: Date = new Date(this.clock().getTime() - this.retentionDays * 24 * 60 * 60 * 1000),
  ): Promise<void> {
    if (!this.haClient.getHistory) return;
    const history = await this.haClient.getHistory(entityId, from, this.clock());
    const rows = history
      .map((state: HAState) => ({ areaId, role: role as AreaSensorRole, value: Number(state.state), at: new Date(state.last_changed || state.last_updated || '') }))
      .filter((row) => Number.isFinite(row.value) && !Number.isNaN(row.at.getTime()));
    if (rows.length) await this.database.sensorReading.createMany({ data: rows });
  }
}

export const sensorRecorder = new SensorRecorder();
