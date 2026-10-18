import React, { useMemo } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputLabel, MenuItem,
  Paper, Select, Typography,
} from "@mui/material";
import { Delete } from "@mui/icons-material";
import { apiService } from "../services/api";
import {
  useArea, useAreaSensorBindings, useAreaSensorReadings, useDeleteAreaSensorBinding,
  useSetAreaSensorBinding, useUpdateArea,
} from "../hooks/useAreas";
import { AreaSensorRole } from "../types/models";
import { useQuery } from "@tanstack/react-query";

const roles: { value: AreaSensorRole; label: string }[] = [
  { value: "temperature", label: "Temperature" },
  { value: "humidity", label: "Humidity" },
  { value: "vpd", label: "VPD" },
];

const AreaSensorBindings: React.FC<{ areaId: number }> = ({ areaId }) => {
  const bindings = useAreaSensorBindings(areaId);
  const area = useArea(areaId);
  const readings = useAreaSensorReadings(areaId);
  const entities = useQuery({ queryKey: ["ha", "entities"], queryFn: () => apiService.getHAEntities() });
  const updateArea = useUpdateArea();
  const setBinding = useSetAreaSensorBinding();
  const deleteBinding = useDeleteAreaSensorBinding();
  const bindingByRole = useMemo(
    () => new Map((bindings.data || []).map((binding) => [binding.role, binding])),
    [bindings.data],
  );
  const sensorEntities = (entities.data || []).filter((entity) => entity.entity_id.startsWith("sensor."));
  const climateEntities = (entities.data || []).filter((entity) => entity.entity_id.startsWith("climate."));

  return (
    <Paper sx={{ p: 2.5, mb: 2 }}>
      <Typography variant="overline" color="textSecondary" sx={{ display: "block", mb: 1 }}>
        Home Assistant Sensors
      </Typography>
      {bindings.isLoading || entities.isLoading ? <CircularProgress size={20} /> : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {roles.map(({ value: role, label }) => {
            const binding = bindingByRole.get(role);
            const reading = readings.data?.find((item) => item.role === role);
            return (
              <Box key={role} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <FormControl size="small" sx={{ minWidth: 210, flex: 1 }}>
                  <InputLabel>{label}</InputLabel>
                  <Select
                    label={label}
                    value={binding?.entityId || ""}
                    onChange={(event) => {
                      const entityId = event.target.value;
                      if (entityId) setBinding.mutate({ areaId, role, entityId });
                    }}
                  >
                    <MenuItem value=""><em>Not configured</em></MenuItem>
                    {sensorEntities.map((entity) => (
                      <MenuItem key={entity.entity_id} value={entity.entity_id}>{entity.entity_id}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {binding && (
                  <Button
                    size="small"
                    color="error"
                    startIcon={<Delete />}
                    onClick={() => deleteBinding.mutate({ areaId, role })}
                  >
                    Remove
                  </Button>
                )}
                {reading && (
                  <Chip
                    size="small"
                    color={reading.stale ? "warning" : "success"}
                    label={reading.stale ? "Stale" : `${reading.value ?? "—"} ${reading.unit || ""}`.trim()}
                  />
                )}
              </Box>
            );
          })}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <FormControl size="small" sx={{ minWidth: 210, flex: 1 }}>
              <InputLabel>Room climate</InputLabel>
              <Select
                label="Room climate"
                value={area.data?.roomClimateEntityId || ""}
                onChange={(event) => updateArea.mutate({ id: areaId, data: { roomClimateEntityId: event.target.value || null } })}
              >
                <MenuItem value=""><em>Not configured</em></MenuItem>
                {climateEntities.map((entity) => <MenuItem key={entity.entity_id} value={entity.entity_id}>{entity.entity_id}</MenuItem>)}
              </Select>
            </FormControl>
            {readings.data?.filter((item) => item.role === "roomTemperature" || item.role === "roomHumidity").map((reading) => (
              <Chip key={reading.role} size="small" color={reading.stale ? "warning" : "success"}
                label={`${reading.role === "roomTemperature" ? "Room" : "RH"}: ${reading.stale ? "Stale" : reading.value ?? "—"} ${reading.unit || ""}`.trim()} />
            ))}
          </Box>
          {area.data?.roomClimateEntityId && readings.data?.some((item) => item.role === "roomHumidity" && item.value === null) && (
            <Alert severity="info">This climate device does not expose current humidity; room humidity will remain unavailable.</Alert>
          )}
          {entities.isError && <Alert severity="warning">Home Assistant entities unavailable.</Alert>}
          {readings.isError && <Alert severity="warning">Live readings unavailable.</Alert>}
        </Box>
      )}
    </Paper>
  );
};

export default AreaSensorBindings;
