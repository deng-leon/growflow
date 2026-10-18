import axios from 'axios';
import {
  Plant, PlantPhase, PlantEvent, CreatePlantRequest, CreateEventRequest, PhasePreset,
  GrowArea, AreaEvent, CreateAreaRequest, CreateAreaEventRequest,
  AreaSensorBinding, AreaSensorReading,
  AreaPhaseSettings,
  AreaActuatorBinding, AreaActuatorRole, ActionLog, ControllerStatus,
  AreaHistory,
} from '../types/models';
import { Strain, CreateStrainData, UpdateStrainData } from '../types/strain';

export interface HAStatus {
  status: 'connected' | 'connecting' | 'disconnected';
  configured: boolean;
  entities: number;
}

export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

const api = axios.create({
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const path = window.location.pathname;
  const ingressMatch = path.match(/^(\/api\/hassio_ingress\/[^\/]+)/);
  const basePath = ingressMatch ? ingressMatch[1] : '';
  if (config.url && !config.url.startsWith('http')) {
    config.url = `${basePath}/api${config.url}`;
  }
  return config;
});

const getBasePath = () => {
  const p = window.location.pathname;
  const m = p.match(/^(\/api\/hassio_ingress\/[^\/]+)/);
  return m ? m[1] : '';
};

export const getPhotoUrl = (filename: string) =>
  `${getBasePath()}/api/uploads/files/${filename}`;

export const apiService = {
  getHAStatus: async (): Promise<HAStatus> => {
    const response = await api.get('/ha/status');
    return response.data;
  },

  getHAEntities: async (domain?: string): Promise<HAEntity[]> => {
    const response = await api.get(`/ha/entities${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`);
    return response.data;
  },

  // Plants
  getPlants: async (): Promise<Plant[]> => {
    const response = await api.get('/plants');
    return response.data;
  },

  getPlant: async (id: number): Promise<Plant> => {
    const response = await api.get(`/plants/${id}`);
    return response.data;
  },

  createPlant: async (data: CreatePlantRequest): Promise<Plant> => {
    const response = await api.post('/plants', data);
    return response.data;
  },

  updatePlant: async (id: number, data: Partial<Plant>): Promise<Plant> => {
    const response = await api.put(`/plants/${id}`, data);
    return response.data;
  },

  deletePlant: async (id: number): Promise<void> => {
    await api.delete(`/plants/${id}`);
  },

  // Phases
  updatePlantPhases: async (plantId: number, phases: PlantPhase[]): Promise<Plant> => {
    const response = await api.put(`/plants/${plantId}/phases`, { phases });
    return response.data;
  },

  updatePhaseStartDate: async (plantId: number, phaseId: number, startDate: string | null): Promise<Plant> => {
    const plant = await apiService.getPlant(plantId);
    const updatedPhases = plant.phases.map(phase =>
      phase.id === phaseId ? { ...phase, startDate: startDate || undefined } : phase
    );
    return apiService.updatePlantPhases(plantId, updatedPhases);
  },

  startNextPhase: async (plantId: number): Promise<Plant> => {
    const plant = await apiService.getPlant(plantId);
    const phases = plant.phases.sort((a, b) => a.sortOrder - b.sortOrder);

    let currentIdx = -1;
    for (let i = 0; i < phases.length; i++) {
      if (phases[i].startDate) currentIdx = i;
    }
    if (currentIdx === -1 || currentIdx >= phases.length - 1) {
      throw new Error('Cannot start next phase');
    }

    const now = new Date().toISOString();
    const updatedPhases = phases.map((p, i) =>
      i === currentIdx + 1 ? { ...p, startDate: now } : p
    );
    return apiService.updatePlantPhases(plantId, updatedPhases);
  },

  // Events
  createEvent: async (plantId: number, eventData: CreateEventRequest): Promise<Plant> => {
    const response = await api.post(`/plants/${plantId}/events`, eventData);
    return response.data;
  },

  updateEvent: async (plantId: number, eventId: number, eventData: Partial<PlantEvent>): Promise<Plant> => {
    const response = await api.put(`/plants/${plantId}/events/${eventId}`, eventData);
    return response.data;
  },

  deleteEvent: async (plantId: number, eventId: number): Promise<Plant> => {
    const response = await api.delete(`/plants/${plantId}/events/${eventId}`);
    return response.data;
  },

  // Strains
  getStrains: async (): Promise<Strain[]> => {
    const response = await api.get('/strains');
    return response.data;
  },

  createStrain: async (data: CreateStrainData): Promise<Strain> => {
    const response = await api.post('/strains', data);
    return response.data;
  },

  updateStrain: async (id: number, data: Partial<UpdateStrainData>): Promise<Strain> => {
    const response = await api.put(`/strains/${id}`, data);
    return response.data;
  },

  deleteStrain: async (id: number): Promise<void> => {
    await api.delete(`/strains/${id}`);
  },

  // Presets
  getPresets: async (growType?: string, sourceType?: string): Promise<PhasePreset[]> => {
    const params = new URLSearchParams();
    if (growType) params.set('growType', growType);
    if (sourceType) params.set('sourceType', sourceType);
    const response = await api.get(`/presets?${params}`);
    return response.data;
  },

  // Uploads
  uploadPhotos: async (plantId: number, files: File[]): Promise<string[]> => {
    const formData = new FormData();
    files.forEach(f => formData.append('photos', f));
    const response = await api.post(`/uploads/${plantId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000
    });
    return response.data.photos;
  },

  deletePhoto: async (filename: string): Promise<void> => {
    await api.delete(`/uploads/${filename}`);
  },

  // Grow Areas
  getAreas: async (): Promise<GrowArea[]> => {
    const response = await api.get('/areas');
    return response.data;
  },

  getArea: async (id: number): Promise<GrowArea> => {
    const response = await api.get(`/areas/${id}`);
    return response.data;
  },

  getAreaSensorBindings: async (areaId: number): Promise<AreaSensorBinding[]> => {
    const response = await api.get(`/areas/${areaId}/sensors`);
    return response.data;
  },

  setAreaSensorBinding: async (
    areaId: number,
    role: AreaSensorBinding["role"],
    entityId: string,
  ): Promise<AreaSensorBinding> => {
    const response = await api.put(`/areas/${areaId}/sensors/${role}`, { entityId });
    return response.data;
  },

  deleteAreaSensorBinding: async (areaId: number, role: AreaSensorBinding["role"]): Promise<void> => {
    await api.delete(`/areas/${areaId}/sensors/${role}`);
  },

  getAreaSensorReadings: async (areaId: number): Promise<AreaSensorReading[]> => {
    const response = await api.get(`/areas/${areaId}/readings`);
    return response.data;
  },

  getAreaActuatorBindings: async (areaId: number): Promise<AreaActuatorBinding[]> => {
    const response = await api.get(`/areas/${areaId}/actuators`);
    return response.data;
  },

  setAreaActuatorBinding: async (areaId: number, role: AreaActuatorRole, data: Partial<AreaActuatorBinding> & { entityId: string }) => {
    const response = await api.put(`/areas/${areaId}/actuators/${role}`, data);
    return response.data as AreaActuatorBinding;
  },

  deleteAreaActuatorBinding: async (areaId: number, role: AreaActuatorRole): Promise<void> => {
    await api.delete(`/areas/${areaId}/actuators/${role}`);
  },

  setAreaActuatorManual: async (areaId: number, role: AreaActuatorRole, on: boolean, expiryMinutes?: number) => {
    const response = await api.post(`/areas/${areaId}/actuators/${role}/manual`, { on, expiryMinutes });
    return response.data as { binding: AreaActuatorBinding; actionLog: ActionLog };
  },

  setAreaActuatorOverride: async (areaId: number, enabled: boolean, expiryMinutes?: number, role?: AreaActuatorRole) => {
    const response = await api.put(`/areas/${areaId}/actuators/${role ? `${role}/` : ""}override`, { enabled, expiryMinutes });
    return response.data as AreaActuatorBinding[];
  },

  getAreaActionLog: async (areaId: number): Promise<ActionLog[]> => {
    const response = await api.get(`/areas/${areaId}/action-log`);
    return response.data;
  },

  getAreaHistory: async (
    areaId: number,
    params: { roles?: string; from: string; to: string; buckets: number },
  ): Promise<AreaHistory> => {
    const query = new URLSearchParams({
      roles: params.roles || "temperature,humidity,vpd",
      from: params.from,
      to: params.to,
      buckets: String(params.buckets),
    });
    const response = await api.get(`/areas/${areaId}/history?${query}`);
    return response.data;
  },

  getAreaPhaseSettings: async (areaId: number): Promise<AreaPhaseSettings[]> => {
    const response = await api.get(`/areas/${areaId}/settings`);
    return response.data;
  },

  updateAreaPhaseSettings: async (areaId: number, phaseName: string, data: Partial<AreaPhaseSettings>): Promise<AreaPhaseSettings> => {
    const response = await api.put(`/areas/${areaId}/settings/${encodeURIComponent(phaseName)}`, data);
    return response.data;
  },

  deleteAreaPhaseSettings: async (areaId: number, phaseName: string): Promise<void> => {
    await api.delete(`/areas/${areaId}/settings/${encodeURIComponent(phaseName)}`);
  },

  createArea: async (data: CreateAreaRequest): Promise<GrowArea> => {
    const response = await api.post('/areas', data);
    return response.data;
  },

  updateArea: async (id: number, data: Partial<GrowArea>): Promise<GrowArea> => {
    const response = await api.put(`/areas/${id}`, data);
    return response.data;
  },

  getControllerStatus: async (): Promise<ControllerStatus> => {
    const response = await api.get('/controller/status');
    return response.data;
  },

  deleteArea: async (id: number): Promise<void> => {
    await api.delete(`/areas/${id}`);
  },

  // Area Events
  getAreaEvents: async (
    areaId: number,
    filters?: { type?: string; from?: string; to?: string; limit?: number; offset?: number },
  ): Promise<AreaEvent[]> => {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const response = await api.get(`/areas/${areaId}/events?${params}`);
    return response.data;
  },

  createAreaEvent: async (areaId: number, data: CreateAreaEventRequest): Promise<AreaEvent> => {
    const response = await api.post(`/areas/${areaId}/events`, data);
    return response.data;
  },

  updateAreaEvent: async (areaId: number, eventId: number, data: Partial<AreaEvent>): Promise<AreaEvent> => {
    const response = await api.put(`/areas/${areaId}/events/${eventId}`, data);
    return response.data;
  },

  deleteAreaEvent: async (areaId: number, eventId: number): Promise<void> => {
    await api.delete(`/areas/${areaId}/events/${eventId}`);
  },

  assignPlantToArea: async (areaId: number, plantId: number): Promise<GrowArea> => {
    const response = await api.post(`/areas/${areaId}/plants`, { plantId });
    return response.data;
  },

  removePlantFromArea: async (areaId: number, plantId: number): Promise<void> => {
    await api.delete(`/areas/${areaId}/plants/${plantId}`);
  },

  flipArea: async (
    areaId: number,
    payload: { newSchedule: string; transitionPlants?: boolean; timestamp?: string },
  ): Promise<{ area: GrowArea; transitioned: number[] }> => {
    const response = await api.post(`/areas/${areaId}/flip`, payload);
    return response.data;
  },
};
