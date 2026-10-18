export interface Strain {
  id: number;
  name: string;
  type: 'autoflower' | 'photoperiod';
  createdAt: string;
  updatedAt: string;
}

export interface PhaseEnvTargets {
  vpdMin: number | null;
  vpdMax: number | null;
  tempMin: number | null;
  tempMax: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
  lightOnHours: number | null;
}

export interface PlantPhase extends PhaseEnvTargets {
  id: number;
  plantId: number;
  sortOrder: number;
  name: string;
  durationMin: number;
  durationMax: number;
  startDate?: string;
  isActive: boolean;
  isCompleted: boolean;
  notes?: string;
}

export interface PlantEvent {
  id: number;
  plantId: number;
  phaseId?: number;
  type: 'watering' | 'note' | 'training' | 'harvest' | 'observation' | 'transplant' | 'custom';
  title: string;
  timestamp: string;
  notes?: string;
  data?: {
    amount_ml?: number;
    ph_level?: number;
    ec_ppm?: number;
    training_method?: string;
    wet_weight?: number;
    dry_weight?: number;
    photos?: string[];
  };
}

export interface PhasePreset extends PhaseEnvTargets {
  id: number;
  name: string;
  sortOrder: number;
  growType: 'photoperiod' | 'autoflower';
  sourceType: 'seed' | 'clone';
  durationMin: number;
  durationMax: number;
  description?: string;
  strainId?: number;
}

export interface Plant {
  id: number;
  name: string;
  strainId?: number;
  strain?: Strain;
  sourceType: 'seed' | 'clone';
  notes?: string;
  isActive: boolean;
  areaId?: number | null;
  area?: GrowArea;
  phases: PlantPhase[];
  events: PlantEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlantRequest {
  name: string;
  strainId?: number;
  sourceType?: 'seed' | 'clone';
  notes?: string;
  areaId?: number | null;
}

export type AreaType = 'tent' | 'room' | 'outdoor' | 'closet' | 'custom';

export type AreaEventType = 'light_schedule' | 'environment' | 'equipment' | 'note';

export interface AreaEventData {
  // light_schedule
  schedule?: string;
  previous_schedule?: string;
  light_on?: string;
  light_off?: string;
  intensity_percent?: number;
  // environment
  temperature_c?: number;
  humidity_percent?: number;
  co2_ppm?: number;
  light_ppfd?: number;
  // equipment
  equipment_type?: string;
  action?: 'installed' | 'removed' | 'adjusted';
  details?: string;
}

export interface AreaEvent {
  id: number;
  areaId: number;
  type: AreaEventType;
  title: string;
  timestamp: string;
  notes?: string;
  data?: AreaEventData;
  source: 'manual' | 'ha_sensor' | 'ha_mqtt';
  createdAt: string;
}

export interface GrowArea {
  id: number;
  name: string;
  type: AreaType;
  description?: string;
  isActive: boolean;
  controlPhaseName?: string | null;
  lightSchedule?: string;
  leafOffsetC: number;
  roomClimateEntityId?: string | null;
  plants?: Plant[];
  plantCount?: number;
  events?: AreaEvent[];
  createdAt: string;
  updatedAt: string;
}

export type AreaSensorRole = "temperature" | "humidity" | "vpd" | "roomTemperature" | "roomHumidity";

export interface AreaSensorBinding {
  id: number;
  areaId: number;
  role: AreaSensorRole;
  entityId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AreaSensorReading {
  role: AreaSensorRole;
  entityId: string;
  value: number | null;
  unit: string | null;
  stale: boolean;
  updatedAt: string | null;
}

export type AreaActuatorRole = "light" | "humidifier" | "dehumidifier" | "ventilation" | "fan";
export type ActuatorAlgorithm = "hysteresis" | "pid";
export type ActuatorFailSafe = "hold" | "off" | "on";

export interface AreaActuatorBinding {
  id: number;
  areaId: number;
  role: AreaActuatorRole;
  entityId: string;
  speedEntityId: string | null;
  maxSpeedPercent: number;
  algorithm: ActuatorAlgorithm;
  failSafe: ActuatorFailSafe;
  minOnSeconds: number;
  minOffSeconds: number;
  kp: number;
  ki: number;
  kd: number;
  windowSeconds: number;
  manualUntil: string | null;
  manual: boolean;
  state?: string;
  speedPercent?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionLog {
  id: number;
  areaId: number;
  role: AreaActuatorRole;
  entityId: string;
  action: string;
  reason: string;
  source: "manual" | "controller";
  createdAt: string;
}

export interface AreaHistoryReading {
  avg: number;
  min: number;
  max: number;
}

export interface AreaHistoryBucket {
  start: string;
  end: string;
  readings: Partial<Record<AreaSensorRole, AreaHistoryReading | null>>;
}

export interface AreaHistory {
  areaId: number;
  from: string;
  to: string;
  buckets: AreaHistoryBucket[];
}

export interface AreaPhaseSettings {
  id?: number;
  areaId?: number;
  phaseName: string;
  tempMin?: number | null;
  tempMax?: number | null;
  humidityMin?: number | null;
  humidityMax?: number | null;
  vpdMin?: number | null;
  vpdMax?: number | null;
  lightOnTime?: string | null;
  lightOffTime?: string | null;
  ventilationOnMinutes?: number | null;
  ventilationOffMinutes?: number | null;
  fanSchedule?: string | null;
}

export interface CreateAreaRequest {
  name: string;
  type?: AreaType;
  description?: string;
  lightSchedule?: string;
  controlPhaseName?: string | null;
}

export interface ControllerStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  lastTickAreas: number;
  lastTickError?: string;
}

export interface CreateAreaEventRequest {
  type: AreaEventType;
  title: string;
  timestamp?: string;
  notes?: string;
  data?: AreaEventData;
}

export interface CreateEventRequest {
  type: PlantEvent['type'];
  title: string;
  timestamp?: string;
  notes?: string;
  data?: PlantEvent['data'];
}
