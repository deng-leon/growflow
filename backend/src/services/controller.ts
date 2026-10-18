import { CONFIG } from '../config/settings';
import { prisma } from '../database';
import { resolveAreaPhaseSchedule, resolveAreaPhaseSettings } from '../utils/phaseUtils';
import { calculateEffectiveHumidityBand, calculateVpd } from '../utils/vpd';
import { ventilationDemand } from '../utils/ventilation';
import { haClient, HAClient, HAState } from './haClient';
import { clampSpeedPercent, scaleSpeedPercent, setActuatorOutput } from './actuatorOutput';
import { extractClimateReadings } from '../utils/climate';

export type ControllerClock = () => Date;
export type HysteresisDirection = 'humidifier' | 'dehumidifier';
export type PidDirection = 'humidifier' | 'dehumidifier' | 'ventilation';

export interface PidInput {
  measurement: number;
  setpoint: number;
  direction: PidDirection;
  kp: number;
  ki: number;
  kd: number;
  dtSeconds: number;
  integral: number;
  previousError: number | null;
  integralClamp?: number;
}

export interface PidResult {
  output: number;
  integral: number;
  previousError: number;
}

export const calculatePidOutput = ({
  measurement,
  setpoint,
  direction,
  kp,
  ki,
  kd,
  dtSeconds,
  integral,
  previousError,
  integralClamp = 100,
}: PidInput): PidResult => {
  const safeDt = Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0);
  const error = direction === 'humidifier' ? setpoint - measurement : measurement - setpoint;
  const boundedIntegral = Math.max(-integralClamp, Math.min(integralClamp, integral));
  const candidateIntegral = Math.max(
    -integralClamp,
    Math.min(integralClamp, boundedIntegral + error * safeDt),
  );
  const derivative = previousError === null || safeDt <= 0 ? 0 : (error - previousError) / safeDt;
  const unsaturated = kp * error + ki * candidateIntegral + kd * derivative;
  const saturatedHigh = unsaturated > 1 && error > 0;
  const saturatedLow = unsaturated < 0 && error < 0;
  const nextIntegral = saturatedHigh || saturatedLow ? boundedIntegral : candidateIntegral;
  const output = Math.max(0, Math.min(1, kp * error + ki * nextIntegral + kd * derivative));
  return { output, integral: nextIntegral, previousError: error };
};

export interface TimeProportioningInput {
  output: number;
  now: Date;
  windowSeconds: number;
  isOn: boolean;
  lastChangeAt?: Date | null;
  minOnSeconds: number;
  minOffSeconds: number;
}

export const timeProportioning = ({
  output,
  now,
  windowSeconds,
  isOn,
  lastChangeAt,
  minOnSeconds,
  minOffSeconds,
}: TimeProportioningInput): boolean => {
  const window = Math.max(1, windowSeconds);
  const duty = Math.max(0, Math.min(1, output));
  const elapsedInWindow = ((now.getTime() / 1000) % window + window) % window;
  const targetOn = elapsedInWindow < duty * window;
  if (targetOn === isOn || !lastChangeAt) return targetOn;
  const elapsed = Math.max(0, (now.getTime() - lastChangeAt.getTime()) / 1000);
  return elapsed >= (targetOn ? minOffSeconds : minOnSeconds) ? targetOn : isOn;
};

export interface HysteresisInput {
  value: number;
  min: number;
  max: number;
  isOn: boolean;
  lastChangeAt?: Date | null;
  now: Date;
  minOnSeconds: number;
  minOffSeconds: number;
  direction: HysteresisDirection;
}

export const decideHysteresis = ({
  value,
  min,
  max,
  isOn,
  lastChangeAt,
  now,
  minOnSeconds,
  minOffSeconds,
  direction,
}: HysteresisInput): boolean => {
  if (!Number.isFinite(value) || min > max) return isOn;

  const elapsedSeconds = lastChangeAt
    ? Math.max(0, (now.getTime() - lastChangeAt.getTime()) / 1000)
    : Number.POSITIVE_INFINITY;

  if (isOn) {
    return (direction === 'humidifier' ? value > max : value < min)
      && elapsedSeconds >= minOnSeconds ? false : true;
  }
  return (direction === 'humidifier' ? value < min : value > max)
    && elapsedSeconds >= minOffSeconds ? true : false;
};

export interface ScheduleWindow {
  start: number;
  end: number;
}

const parseTime = (value: string | null | undefined): number | null => {
  const match = typeof value === 'string' && value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
};

export const parseScheduleWindow = (value: string | null | undefined): ScheduleWindow | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const start = parseTime(parsed?.start ?? parsed?.on ?? parsed?.onTime);
    const end = parseTime(parsed?.end ?? parsed?.off ?? parsed?.offTime);
    if (start !== null && end !== null) return { start, end };
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parseScheduleWindow(typeof parsed[0] === 'string' ? parsed[0] : JSON.stringify(parsed[0]));
    }
  } catch {
    // Plain text schedules are supported below.
  }
  const match = value.match(/(\d{1,2}:\d{2})\s*(?:-|–|to)\s*(\d{1,2}:\d{2})/i);
  const start = parseTime(match?.[1]);
  const end = parseTime(match?.[2]);
  return start === null || end === null ? null : { start, end };
};

export const isWithinSchedule = (minutes: number, window: ScheduleWindow | null): boolean => {
  if (!window) return false;
  if (window.start === window.end) return true;
  return window.start < window.end
    ? minutes >= window.start && minutes < window.end
    : minutes >= window.start || minutes < window.end;
};

export const decideDutyCycle = (
  now: Date,
  onMinutes: number | null | undefined,
  offMinutes: number | null | undefined,
  minuteOfDay = now.getHours() * 60 + now.getMinutes(),
): boolean | null => {
  if (!Number.isFinite(onMinutes) || !Number.isFinite(offMinutes)
    || (onMinutes as number) < 0 || (offMinutes as number) < 0
    || (onMinutes as number) + (offMinutes as number) <= 0) return null;
  const cycle = (onMinutes as number) + (offMinutes as number);
  return (minuteOfDay % cycle) < (onMinutes as number);
};

type ControllerDatabase = Pick<typeof prisma, 'growArea' | 'actionLog'> & {
  areaActuatorBinding?: Pick<typeof prisma.areaActuatorBinding, 'update'>;
};
type ControllerHAClient = Pick<HAClient, 'listEntities' | 'callService'> & Partial<Pick<HAClient, 'getStatus'>>;

export interface ControllerOptions {
  haClient: ControllerHAClient;
  database: ControllerDatabase;
  clock?: ControllerClock;
  intervalMs?: number;
}

export interface ControllerStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastTickAreas: number;
  lastTickError?: string;
}

export class Controller {
  private timer?: NodeJS.Timeout;
  private readonly clock: ControllerClock;
  private readonly intervalMs: number;
  private readonly failSafeActive = new Set<string>();
  private readonly pidStates = new Map<string, { algorithm: string; integral: number; previousError: number | null; lastAt: Date }>();
  private readonly actuatorAlgorithms = new Map<string, string>();
  private readonly ventilationSaturatedAt = new Map<string, Date>();
  private lastTickAt: Date | null = null;
  private lastTickAreas = 0;
  private lastTickError?: string;

  constructor(private readonly dependencies: ControllerOptions) {
    this.clock = dependencies.clock ?? (() => new Date());
    this.intervalMs = dependencies.intervalMs ?? CONFIG.CONTROLLER.INTERVAL_MS;
  }

  start(): void {
    if (this.timer || !CONFIG.CONTROLLER.ENABLED || !this.isHAConfigured()) return;
    this.timer = setInterval(() => {
      this.tick().catch((error) => console.error('Controller tick failed:', error));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  getStatus(): ControllerStatus {
    return {
      enabled: CONFIG.CONTROLLER.ENABLED,
      running: Boolean(this.timer),
      intervalMs: this.intervalMs,
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      lastTickAreas: this.lastTickAreas,
      ...(this.lastTickError ? { lastTickError: this.lastTickError } : {}),
    };
  }

  async tick(): Promise<void> {
    this.lastTickAt = this.clock();
    this.lastTickError = undefined;
    try {
      await this.runTick();
    } catch (error) {
      this.lastTickError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async runTick(): Promise<void> {
    const now = this.clock();
    const haStatus = this.dependencies.haClient.getStatus?.();
    const disconnected = haStatus?.status === 'disconnected';
    const states = await this.dependencies.haClient.listEntities().catch(() => []);
    const areas = await this.dependencies.database.growArea.findMany({
      where: {
        isActive: true,
        OR: [
          { plants: { some: { isActive: true } } },
          { controlPhaseName: { not: null } },
        ],
      },
      include: {
        plants: {
          where: { isActive: true, phases: { some: { isActive: true } } },
          include: { phases: { where: { isActive: true }, take: 1 } }
        },
        sensorBindings: true,
        actuatorBindings: true,
        phaseSettings: true
      }
    });
    this.lastTickAreas = areas.length;

    for (const area of areas) {
      try {
      const phase = area.plants.flatMap((plant) => plant.phases)[0]
        ?? (area.controlPhaseName ? { name: area.controlPhaseName, startDate: null } : null);
      for (const binding of area.actuatorBindings) {
        const key = `${area.id}:${binding.role}`;
        if (binding.manual && binding.manualUntil && binding.manualUntil <= now) {
          await this.dependencies.database.areaActuatorBinding?.update?.({
            where: { id: binding.id },
            data: { manual: false, manualUntil: null }
          });
          await this.dependencies.database.actionLog.create({
            data: {
              areaId: area.id,
              role: binding.role,
              entityId: binding.entityId,
              action: states.find((state) => state.entity_id === binding.entityId)?.state || 'unknown',
              reason: 'manual-expired',
              source: 'controller'
            }
          });
          binding.manual = false;
          binding.manualUntil = null;
        }
        if (binding.manual && (!binding.manualUntil || binding.manualUntil > now)) {
          this.failSafeActive.delete(key);
          this.pidStates.delete(key);
          continue;
        }
      }

      const phaseSettings = phase && area.phaseSettings.find((settings) => settings.phaseName === phase.name);
      const targets = phase ? resolveAreaPhaseSettings(phase, phaseSettings) : null;
      const schedule = resolveAreaPhaseSchedule(phaseSettings);
      const humidityBinding = area.sensorBindings.find((binding) => binding.role === 'humidity');
      const temperatureBinding = area.sensorBindings.find((binding) => binding.role === 'temperature');
      const vpdBinding = area.sensorBindings.find((binding) => binding.role === 'vpd');
      const humidity = this.numericAvailableState(
        humidityBinding && states.find((state) => state.entity_id === humidityBinding.entityId), now);
      const temperature = this.numericAvailableState(
        temperatureBinding && states.find((state) => state.entity_id === temperatureBinding.entityId), now);
      const roomReadings = this.getRoomReadings(
        area.sensorBindings, states, now, area.roomClimateEntityId);
      const roomHumidity = roomReadings.humidity;
      const roomTemperature = roomReadings.temperature;
      const vpdState = this.numericAvailableState(
        vpdBinding && states.find((state) => state.entity_id === vpdBinding.entityId), now);
      const actualVpd = vpdState ?? (temperature !== null && humidity !== null
        ? calculateVpd(temperature, humidity, area.leafOffsetC ?? -2) : null);
      const vpdBand = temperature === null || !targets ? null : calculateEffectiveHumidityBand(
        temperature, area.leafOffsetC ?? -2, targets.vpdMin, targets.vpdMax,
        targets.humidityMin, targets.humidityMax);
      const humidityBand = vpdBand ?? (targets && targets.humidityMin !== null && targets.humidityMax !== null
        ? { min: targets.humidityMin, max: targets.humidityMax, unreachable: false } : null);
      const lightWindow = schedule.lightOnTime && schedule.lightOffTime
        ? parseScheduleWindow(`${schedule.lightOnTime}-${schedule.lightOffTime}`) : null;
      const fanWindow = parseScheduleWindow(schedule.fanSchedule);
      const minuteOfDay = this.localMinutes(now);
      const demand = temperature !== null && humidity !== null && humidityBand
        ? ventilationDemand({
          tentTemperature: temperature,
          tentHumidity: humidity,
          temperatureMin: targets?.tempMin,
          temperatureMax: targets?.tempMax,
          humidityMin: humidityBand.min,
          humidityMax: humidityBand.max,
          roomTemperature,
          roomHumidity,
          minSpeedPercent: CONFIG.CONTROLLER.VENTILATION_MIN_SPEED_PERCENT,
        }) : null;
      const hasRoomSensors = roomTemperature !== null && roomHumidity !== null;
      const ventilationKey = `${area.id}:ventilation`;
      if (demand && hasRoomSensors && demand.canHelp && demand.speedPercent >= 100) {
        if (!this.ventilationSaturatedAt.has(ventilationKey)) this.ventilationSaturatedAt.set(ventilationKey, now);
      } else {
        this.ventilationSaturatedAt.delete(ventilationKey);
      }
      const saturatedLongEnough = this.ventilationSaturatedAt.has(ventilationKey)
        && (now.getTime() - this.ventilationSaturatedAt.get(ventilationKey)!.getTime())
          >= CONFIG.CONTROLLER.STAGING_DELAY_S * 1000;
      const stageTwoAllowed = !hasRoomSensors || !demand || !demand.canHelp || saturatedLongEnough;

      for (const binding of area.actuatorBindings) {
        const key = `${area.id}:${binding.role}`;
        const previousAlgorithm = this.actuatorAlgorithms.get(key);
        if (previousAlgorithm && previousAlgorithm !== binding.algorithm) this.pidStates.delete(key);
        this.actuatorAlgorithms.set(key, binding.algorithm);
        if (binding.manual && (!binding.manualUntil || binding.manualUntil > now)) continue;
        const current = states.find((state) => state.entity_id === binding.entityId);
        const isOn = current?.state === 'on';
        if (current?.state !== 'on' && current?.state !== 'off') continue;

        let desired: boolean | null = null;
        let reason = '';
        if (binding.role === 'humidifier' || binding.role === 'dehumidifier') {
          if (!humidityBand || humidity === null || disconnected) {
            await this.applyFailSafe(area.id, binding, states, key);
            continue;
          }
          if (binding.algorithm === 'pid') {
            const pid = this.calculatePid(binding, key, humidity, (humidityBand.min + humidityBand.max) / 2, now);
            desired = timeProportioning({
              output: pid.output, now, windowSeconds: binding.windowSeconds,
              isOn, lastChangeAt: current.last_changed ? new Date(current.last_changed) : null,
              minOnSeconds: binding.minOnSeconds, minOffSeconds: binding.minOffSeconds,
            });
            reason = `PID output ${(pid.output * 100).toFixed(1)}%; target ${((humidityBand.min + humidityBand.max) / 2).toFixed(1)}`
              + (actualVpd === null ? '' : `; VPD ${actualVpd.toFixed(2)} kPa`);
          } else {
            desired = decideHysteresis({
              value: humidity, min: humidityBand.min, max: humidityBand.max, isOn,
              lastChangeAt: current.last_changed ? new Date(current.last_changed) : null, now,
              minOnSeconds: binding.minOnSeconds, minOffSeconds: binding.minOffSeconds,
              direction: binding.role,
            });
            reason = actualVpd === null
              ? `Humidity ${humidity} outside target ${humidityBand.min}-${humidityBand.max}`
              : `Humidity ${humidity} outside target ${humidityBand.min}-${humidityBand.max}; VPD ${actualVpd.toFixed(2)} kPa`;
          }
          if (hasRoomSensors && !stageTwoAllowed) {
            desired = false;
            reason = `stage 1 ventilation (${demand?.speedPercent ?? 0}%)`;
          } else {
            reason = `${saturatedLongEnough ? 'humidifier-stage2' : binding.role === 'humidifier' ? 'humidifier-stage2' : 'dehumidifier-stage2'}; ${reason}`;
          }
          if (binding.role === 'dehumidifier' && desired
            && this.isActive(area, 'humidifier', states)) desired = false;
          if (binding.role === 'humidifier' && desired
            && this.isActive(area, 'dehumidifier', states)) desired = false;
        } else if (binding.role === 'ventilation') {
          const hot = temperature !== null && targets?.tempMax !== null && temperature > (targets?.tempMax as number);
          const damp = humidity !== null && humidityBand !== null && humidity > humidityBand.max;
          const cool = temperature !== null && targets?.tempMin !== null && temperature < (targets?.tempMin as number);
          const dry = humidity !== null && humidityBand !== null && humidity < humidityBand.min;
          const cycle = !hot && !damp
            ? decideDutyCycle(now, schedule.ventilationOnMinutes, schedule.ventilationOffMinutes, minuteOfDay)
            : null;
          if (temperature === null && humidity === null && cycle === null) {
            await this.applyFailSafe(area.id, binding, states, key);
            continue;
          }
          if (hasRoomSensors && demand) {
            desired = demand.speedPercent > 0;
            reason = `ventilation; speed ${demand.speedPercent}%; ${demand.reason}`;
          } else if (binding.algorithm === 'pid' && humidity !== null && humidityBand !== null) {
            const pid = this.calculatePid(binding, key, humidity, (humidityBand.min + humidityBand.max) / 2, now);
            desired = timeProportioning({
              output: pid.output, now, windowSeconds: binding.windowSeconds,
              isOn, lastChangeAt: current.last_changed ? new Date(current.last_changed) : null,
              minOnSeconds: binding.minOnSeconds, minOffSeconds: binding.minOffSeconds,
            });
            reason = `PID output ${(pid.output * 100).toFixed(1)}%; target ${((humidityBand.min + humidityBand.max) / 2).toFixed(1)}`;
          } else {
            desired = hot || damp ? true : (cool || dry ? false : cycle);
            reason = hot || damp ? 'Temperature or humidity above target' : 'Ventilation duty cycle';
          }
        } else if (binding.role === 'light') {
          if (!phase || disconnected) {
            await this.applyFailSafe(area.id, binding, states, key);
            continue;
          }
          desired = lightWindow
            ? isWithinSchedule(minuteOfDay, lightWindow)
            : this.phaseLightOn(phase, targets, now);
          reason = 'Phase light schedule';
        } else if (binding.role === 'fan') {
          if (!phase || disconnected || !fanWindow) {
            if (!fanWindow) {
              await this.applyFailSafe(area.id, binding, states, key);
              continue;
            }
            await this.applyFailSafe(area.id, binding, states, key);
            continue;
          }
          desired = isWithinSchedule(minuteOfDay, fanWindow);
          reason = 'Fan schedule';
        }
        if (desired === null) continue;
        this.failSafeActive.delete(key);
        if (binding.role === 'ventilation' && hasRoomSensors && demand) {
          const currentSpeed = Number(current.attributes?.percentage);
          const requestedSpeed = scaleSpeedPercent(demand.speedPercent, binding.maxSpeedPercent ?? 100);
          const speed = Number.isFinite(currentSpeed)
            && Math.abs(currentSpeed - requestedSpeed) < CONFIG.CONTROLLER.VENTILATION_SPEED_DEADBAND_PERCENT
            ? currentSpeed : requestedSpeed;
          if (!desired && !isOn) continue;
          if (desired !== isOn && !this.minimumTimeElapsed(current, now, desired, binding)) continue;
          if (desired === isOn && Number.isFinite(currentSpeed)
            && Math.abs(currentSpeed - speed) < CONFIG.CONTROLLER.VENTILATION_SPEED_DEADBAND_PERCENT) continue;
          await setActuatorOutput(binding, { on: desired, speedPercent: speed }, this.dependencies.haClient);
          await this.dependencies.database.actionLog.create({
            data: {
              areaId: area.id, role: binding.role, entityId: binding.entityId,
              action: desired ? 'on' : 'off',
              reason: `${reason}; stage ventilation; speed ${speed}%`,
              source: 'controller'
            }
          });
        } else {
          if (binding.role === 'fan' && desired && binding.speedEntityId) {
            const speed = clampSpeedPercent(100, binding.maxSpeedPercent ?? 100);
            const currentSpeed = Number(states.find((state) => state.entity_id === binding.speedEntityId)?.attributes?.percentage);
            if (desired === isOn && Number.isFinite(currentSpeed) && currentSpeed === speed) continue;
            if (desired !== isOn && !this.minimumTimeElapsed(current, now, desired, binding)) continue;
            await setActuatorOutput(binding, {
              on: true,
              speedPercent: speed,
            }, this.dependencies.haClient);
            await this.dependencies.database.actionLog.create({
              data: {
                areaId: area.id, role: binding.role, entityId: binding.entityId,
                action: 'on', reason: `${reason}; speed ${speed}%`,
                source: 'controller',
              },
            });
          } else {
            if (desired === isOn || !this.minimumTimeElapsed(current, now, desired, binding)) continue;
            await this.applyAction(area.id, binding, desired, reason);
          }
        }
      }
          } catch (error) {
        this.lastTickError = error instanceof Error ? error.message : String(error);
        console.error(`Controller failed for area ${area.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  private async applyAction(areaId: number, binding: any, desired: boolean, reason: string): Promise<void> {
    await this.dependencies.haClient.callService('homeassistant', desired ? 'turn_on' : 'turn_off', {
      entity_id: binding.entityId
    });
    await this.dependencies.database.actionLog.create({
      data: { areaId, role: binding.role, entityId: binding.entityId, action: desired ? 'on' : 'off', reason, source: 'controller' }
    });
  }

  private minimumTimeElapsed(state: HAState, now: Date, desired: boolean, binding: any): boolean {
    if (!state.last_changed) return true;
    const elapsed = Math.max(0, (now.getTime() - new Date(state.last_changed).getTime()) / 1000);
    return elapsed >= (desired ? binding.minOffSeconds : binding.minOnSeconds);
  }

  private isActive(area: any, role: string, states: HAState[]): boolean {
    const binding = area.actuatorBindings.find((item: any) => item.role === role);
    return binding ? states.find((state) => state.entity_id === binding.entityId)?.state === 'on' : false;
  }

  private localMinutes(date: Date): number {
    const timezone = CONFIG.CONTROLLER.TIMEZONE;
    if (!timezone) return date.getHours() * 60 + date.getMinutes();
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(date);
      return Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60
        + Number(parts.find((part) => part.type === 'minute')?.value || 0);
    } catch {
      return date.getHours() * 60 + date.getMinutes();
    }
  }

  private phaseLightOn(phase: any, targets: any, now: Date): boolean {
    const hours = targets?.lightOnHours;
    if (!Number.isFinite(hours) || hours <= 0) return false;
    const start = phase.startDate ? new Date(phase.startDate).getTime() : 0;
    return ((now.getTime() - start) / 3600000) % 24 < hours;
  }

  private async applyFailSafe(
    areaId: number,
    binding: any,
    states: HAState[],
    key: string
  ): Promise<void> {
    this.pidStates.delete(key);
    if (this.failSafeActive.has(key)) return;
    this.failSafeActive.add(key);
    const failSafe = binding.failSafe || 'off';
    const current = states.find((state) => state.entity_id === binding.entityId)?.state;
    const action = failSafe === 'hold' ? (current || 'hold') : failSafe;
    if (failSafe !== 'hold') {
      try {
        await this.dependencies.haClient.callService('homeassistant', `turn_${failSafe}`, {
          entity_id: binding.entityId
        });
      } catch {
        // The fail-safe action is still latched and logged if HA is unavailable.
      }

    }
    await this.dependencies.database.actionLog.create({
      data: {
        areaId,
        role: binding.role,
        entityId: binding.entityId,
        action,
        reason: 'failsafe',
        source: 'controller'
      }
    });
  }

  private calculatePid(binding: any, key: string, measurement: number, setpoint: number, now: Date): PidResult {
    const previous = this.pidStates.get(key);
    if (previous && previous.algorithm !== binding.algorithm) this.pidStates.delete(key);
    const state = this.pidStates.get(key);
    const result = calculatePidOutput({
      measurement,
      setpoint,
      direction: binding.role,
      kp: Number.isFinite(binding.kp) ? binding.kp : 0.08,
      ki: Number.isFinite(binding.ki) ? binding.ki : 0.01,
      kd: Number.isFinite(binding.kd) ? binding.kd : 0.02,
      dtSeconds: state ? Math.max(0, (now.getTime() - state.lastAt.getTime()) / 1000) : 0,
      integral: state?.integral ?? 0,
      previousError: state?.previousError ?? null,
    });
    this.pidStates.set(key, { algorithm: binding.algorithm, integral: result.integral, previousError: result.previousError, lastAt: now });
    return result;
  }

  private isHAConfigured(): boolean {
    return Boolean(CONFIG.HOME_ASSISTANT.SUPERVISOR_TOKEN
      || (CONFIG.HOME_ASSISTANT.URL && CONFIG.HOME_ASSISTANT.TOKEN));
  }

  private numericAvailableState(state: HAState | undefined, now: Date): number | null {
    if (!state || state.state === 'unavailable' || state.state === 'unknown') return null;
    const updatedAt = state.last_updated || state.last_changed;
    const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
    if (!Number.isFinite(updatedAtMs) || now.getTime() - updatedAtMs > CONFIG.CONTROLLER.STALE_AFTER_MS) return null;
    const value = Number(state.state);
    return Number.isFinite(value) ? value : null;
  }

  private getRoomReadings(
    bindings: Array<{ role: string; entityId: string }>,
    states: HAState[],
    now: Date,
    roomClimateEntityId?: string | null,
  ): { temperature: number | null; humidity: number | null } {
    if (roomClimateEntityId) {
      const state = states.find((candidate) => candidate.entity_id === roomClimateEntityId);
      const readings = extractClimateReadings(state);
      const updatedAt = state?.last_updated || state?.last_changed;
      const stale = !state || !updatedAt || now.getTime() - new Date(updatedAt).getTime() > CONFIG.CONTROLLER.STALE_AFTER_MS;
      return stale ? { temperature: null, humidity: null } : readings;
    }
    const reading = (role: string) => {
      const binding = bindings.find((item) => item.role === role);
      return this.numericAvailableState(
        binding && states.find((state) => state.entity_id === binding.entityId), now);
    };
    return { temperature: reading('roomTemperature'), humidity: reading('roomHumidity') };
  }
}

export const controller = new Controller({ haClient, database: prisma });
