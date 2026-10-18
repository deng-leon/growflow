import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiService } from "../services/api";
import {
  GrowArea, AreaEvent, CreateAreaRequest, CreateAreaEventRequest,
  AreaSensorBinding,
  AreaPhaseSettings,
  AreaActuatorBinding,
  AreaHistory,
} from "../types/models";
import { plantKeys } from "./usePlants";

export const areaKeys = {
  all: ["areas"] as const,
  lists: () => [...areaKeys.all, "list"] as const,
  details: () => [...areaKeys.all, "detail"] as const,
  detail: (id: number) => [...areaKeys.details(), id] as const,
  events: (id: number) => [...areaKeys.detail(id), "events"] as const,
  sensors: (id: number) => [...areaKeys.detail(id), "sensors"] as const,
  readings: (id: number) => [...areaKeys.detail(id), "readings"] as const,
  settings: (id: number) => [...areaKeys.detail(id), "settings"] as const,
  actuators: (id: number) => [...areaKeys.detail(id), "actuators"] as const,
  actionLog: (id: number) => [...areaKeys.detail(id), "action-log"] as const,
  history: (id: number, from: string, to: string, buckets: number) =>
    [...areaKeys.detail(id), "history", from, to, buckets] as const,
};

export const useAreaHistory = (
  id: number | undefined,
  params: { from: string; to: string; buckets: number },
) => useQuery<AreaHistory>({
  queryKey: areaKeys.history(id as number, params.from, params.to, params.buckets),
  queryFn: () => apiService.getAreaHistory(id as number, params),
  enabled: !!id && !!params.from && !!params.to,
  staleTime: 30_000,
});

export const useAreaActionLog = (id: number | undefined, from?: string, to?: string) => useQuery({
  queryKey: [...areaKeys.actionLog(id as number), from, to],
  queryFn: async () => {
    const logs = await apiService.getAreaActionLog(id as number);
    return logs.filter((log) => (!from || log.createdAt >= from) && (!to || log.createdAt <= to));
  },
  enabled: !!id,
});

export const useAreaActuatorBindings = (id: number | undefined) => useQuery({
  queryKey: areaKeys.actuators(id as number),
  queryFn: () => apiService.getAreaActuatorBindings(id as number),
  enabled: !!id,
  refetchInterval: 10_000,
});

export const useControllerStatus = () => useQuery({
  queryKey: ["controller", "status"],
  queryFn: () => apiService.getControllerStatus(),
  refetchInterval: 10_000,
});

export const useSetAreaActuatorBinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
      mutationFn: ({ areaId, role, data }: { areaId: number; role: AreaActuatorBinding["role"]; data: Partial<AreaActuatorBinding> & { entityId: string } }) =>
      apiService.setAreaActuatorBinding(areaId, role, data),
    onSuccess: (_, { areaId }) => queryClient.invalidateQueries({ queryKey: areaKeys.actuators(areaId) }),
  });
};

export const useDeleteAreaActuatorBinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, role }: { areaId: number; role: AreaActuatorBinding["role"] }) =>
      apiService.deleteAreaActuatorBinding(areaId, role),
    onSuccess: (_, { areaId }) => queryClient.invalidateQueries({ queryKey: areaKeys.actuators(areaId) }),
  });
};

export const useSetAreaActuatorManual = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, role, on, expiryMinutes }: { areaId: number; role: AreaActuatorBinding["role"]; on: boolean; expiryMinutes?: number }) =>
      apiService.setAreaActuatorManual(areaId, role, on, expiryMinutes),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.actuators(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.actionLog(areaId) });
    },
  });
};

export const useSetAreaActuatorOverride = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, enabled, expiryMinutes, role }: { areaId: number; enabled: boolean; expiryMinutes?: number; role?: AreaActuatorBinding["role"] }) =>
      apiService.setAreaActuatorOverride(areaId, enabled, expiryMinutes, role),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.actuators(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.actionLog(areaId) });
    },
  });
};

export const useAreaSensorBindings = (id: number | undefined) => useQuery({
  queryKey: areaKeys.sensors(id as number),
  queryFn: () => apiService.getAreaSensorBindings(id as number),
  enabled: !!id,
});

export const useAreaSensorReadings = (id: number | undefined) => useQuery({
  queryKey: areaKeys.readings(id as number),
  queryFn: () => apiService.getAreaSensorReadings(id as number),
  enabled: !!id,
  refetchInterval: 30_000,
});

export const useAreaPhaseSettings = (id: number | undefined) => useQuery({
  queryKey: areaKeys.settings(id as number),
  queryFn: () => apiService.getAreaPhaseSettings(id as number),
  enabled: !!id,
});

export const useUpdateAreaPhaseSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, phaseName, data }: { areaId: number; phaseName: string; data: Partial<AreaPhaseSettings> }) =>
      apiService.updateAreaPhaseSettings(areaId, phaseName, data),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.settings(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.detail(areaId) });
    },
  });
};

export const useSetAreaSensorBinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, role, entityId }: { areaId: number; role: AreaSensorBinding["role"]; entityId: string }) =>
      apiService.setAreaSensorBinding(areaId, role, entityId),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.sensors(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.readings(areaId) });
    },
  });
};

export const useDeleteAreaSensorBinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, role }: { areaId: number; role: AreaSensorBinding["role"] }) =>
      apiService.deleteAreaSensorBinding(areaId, role),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.sensors(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.readings(areaId) });
    },
  });
};

export const useAreas = () => {
  return useQuery({
    queryKey: areaKeys.lists(),
    queryFn: () => apiService.getAreas(),
    staleTime: 1 * 60 * 1000,
  });
};

export const useArea = (id: number | undefined) => {
  return useQuery({
    queryKey: areaKeys.detail(id as number),
    queryFn: () => apiService.getArea(id as number),
    enabled: !!id,
  });
};

export const useCreateArea = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAreaRequest) => apiService.createArea(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: areaKeys.lists() });
    },
  });
};

export const useUpdateArea = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<GrowArea> }) =>
      apiService.updateArea(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(areaKeys.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: areaKeys.lists() });
    },
  });
};

export const useDeleteArea = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiService.deleteArea(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.lists() });
      queryClient.removeQueries({ queryKey: areaKeys.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: plantKeys.all });
    },
  });
};

export const useCreateAreaEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, data }: { areaId: number; data: CreateAreaEventRequest }) =>
      apiService.createAreaEvent(areaId, data),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.detail(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.events(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.lists() });
    },
  });
};

export const useUpdateAreaEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, eventId, data }: { areaId: number; eventId: number; data: Partial<AreaEvent> }) =>
      apiService.updateAreaEvent(areaId, eventId, data),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.detail(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.events(areaId) });
    },
  });
};

export const useDeleteAreaEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, eventId }: { areaId: number; eventId: number }) =>
      apiService.deleteAreaEvent(areaId, eventId),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.detail(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.events(areaId) });
    },
  });
};

export const useAssignPlantToArea = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, plantId }: { areaId: number; plantId: number }) =>
      apiService.assignPlantToArea(areaId, plantId),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.detail(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.lists() });
      queryClient.invalidateQueries({ queryKey: plantKeys.all });
    },
  });
};

export const useRemovePlantFromArea = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, plantId }: { areaId: number; plantId: number }) =>
      apiService.removePlantFromArea(areaId, plantId),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.detail(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.lists() });
      queryClient.invalidateQueries({ queryKey: plantKeys.all });
    },
  });
};

export const useFlipArea = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ areaId, newSchedule, transitionPlants, timestamp }: {
      areaId: number;
      newSchedule: string;
      transitionPlants?: boolean;
      timestamp?: string;
    }) => apiService.flipArea(areaId, { newSchedule, transitionPlants, timestamp }),
    onSuccess: (_, { areaId }) => {
      queryClient.invalidateQueries({ queryKey: areaKeys.detail(areaId) });
      queryClient.invalidateQueries({ queryKey: areaKeys.lists() });
      queryClient.invalidateQueries({ queryKey: plantKeys.all });
    },
  });
};
