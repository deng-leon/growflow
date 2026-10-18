import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select,
  FormControlLabel, Switch, TextField, Typography,
} from "@mui/material";
import { Delete } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { apiService } from "../services/api";
import {
  useAreaActuatorBindings, useDeleteAreaActuatorBinding, useSetAreaActuatorBinding,
  useSetAreaActuatorManual, useSetAreaActuatorOverride,
  useControllerStatus,
} from "../hooks/useAreas";
import { AreaActuatorBinding, AreaActuatorRole } from "../types/models";

const roles: { value: AreaActuatorRole; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "humidifier", label: "Humidifier" },
  { value: "dehumidifier", label: "Dehumidifier" },
  { value: "ventilation", label: "Ventilation" },
  { value: "fan", label: "Circulation fan" },
];

const AreaActuatorBindings: React.FC<{ areaId: number }> = ({ areaId }) => {
  const bindings = useAreaActuatorBindings(areaId);
  const entities = useQuery({ queryKey: ["ha", "entities"], queryFn: () => apiService.getHAEntities() });
  const setBinding = useSetAreaActuatorBinding();
  const deleteBinding = useDeleteAreaActuatorBinding();
  const manual = useSetAreaActuatorManual();
  const override = useSetAreaActuatorOverride();
  const controllerStatus = useControllerStatus();
  const [expiry, setExpiry] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const isManual = (item?: AreaActuatorBinding) =>
    !!item?.manual && (!item.manualUntil || new Date(item.manualUntil).getTime() > now);
  const remaining = (item: AreaActuatorBinding) => {
    if (!item.manualUntil) return " (no expiry)";
    const seconds = Math.max(0, Math.round((new Date(item.manualUntil).getTime() - now) / 1000));
    return ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left`;
  };
  const configured = (bindings.data || []);
  const allOverridden = configured.length > 0 && configured.every((item) => isManual(item));
  const expiryMinutes = expiry ? Number(expiry) : undefined;
  const bindingByRole = useMemo(() => new Map((bindings.data || []).map((item) => [item.role, item])), [bindings.data]);
  const actuatorEntities = (entities.data || []).filter((entity) =>
    /^(switch|light|fan|humidifier|input_boolean)\./.test(entity.entity_id));
  const switchEntities = actuatorEntities.filter((entity) => entity.entity_id.startsWith("switch."));
  const speedEntities = actuatorEntities.filter((entity) => entity.entity_id.startsWith("fan."));

  return (
    <Paper sx={{ p: 2.5, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="overline" color="textSecondary">Home Assistant Actuators</Typography>
        <Chip
          size="small"
          color={controllerStatus.data?.running ? "success" : "default"}
          label={controllerStatus.data?.running ? "Controller: running" : "Controller: disabled (set CONTROLLER_ENABLED=true)"}
        />
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
        <FormControlLabel
          control={<Switch checked={allOverridden} disabled={!configured.length}
            onChange={(_, enabled) => override.mutate({ areaId, enabled, expiryMinutes })} />}
          label="Override all (pause controller)"
        />
        <TextField size="small" type="number" label="Duration (min)" value={expiry}
          onChange={(event) => setExpiry(event.target.value)} helperText="empty = until switched off" sx={{ width: 150 }} />
      </Box>
      {bindings.isLoading || entities.isLoading ? <CircularProgress size={20} /> : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {roles.map(({ value: role, label }) => {
            const binding = bindingByRole.get(role);
            return (
              <Box key={role} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <FormControl size="small" sx={{ minWidth: 210, flex: 1 }}>
                  <InputLabel>{label}</InputLabel>
                  <Select label={label} value={binding?.entityId || ""} onChange={(event) => {
                    const entityId = event.target.value;
                    if (entityId) setBinding.mutate({ areaId, role, data: { entityId } });
                  }}>
                    <MenuItem value=""><em>Not configured</em></MenuItem>
                    {((role === "ventilation" ? switchEntities : actuatorEntities)
                      .some((entity) => entity.entity_id === binding?.entityId)
                      ? (role === "ventilation" ? switchEntities : actuatorEntities)
                      : [...(role === "ventilation" ? switchEntities : actuatorEntities), ...(binding ? [{ entity_id: binding.entityId }] : [])]
                    ).map((entity) => <MenuItem key={entity.entity_id} value={entity.entity_id}>{entity.entity_id}</MenuItem>)}
                  </Select>
                </FormControl>
                {binding && <>
                  {(role === "ventilation" || role === "fan") && (
                    <>
                      <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Speed (optional)</InputLabel>
                        <Select
                          label="Speed (optional)"
                          value={binding.speedEntityId || ""}
                          onChange={(event) => setBinding.mutate({
                            areaId, role, data: { entityId: binding.entityId, speedEntityId: event.target.value || null },
                          })}
                        >
                          <MenuItem value=""><em>No speed control</em></MenuItem>
                          {speedEntities.map((entity) => <MenuItem key={entity.entity_id} value={entity.entity_id}>{entity.entity_id}</MenuItem>)}
                        </Select>
                      </FormControl>
                      {binding.speedEntityId && (
                        <>
                          <TextField
                            key={`max-speed-${binding.id}-${binding.maxSpeedPercent}`}
                            size="small"
                            type="number"
                            label="Max speed %"
                            defaultValue={binding.maxSpeedPercent}
                            inputProps={{ min: 1, max: 100, step: 1 }}
                            onBlur={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isInteger(value) && value >= 1 && value <= 100) {
                                setBinding.mutate({ areaId, role, data: { entityId: binding.entityId, maxSpeedPercent: value } });
                              }
                            }}
                            sx={{ width: 110 }}
                          />
                        </>
                      )}
                    </>
                  )}
                  {binding.speedPercent != null && <Typography variant="caption">Speed {binding.speedPercent}%</Typography>}
                  <Typography variant="caption">{binding.state || "unknown"}</Typography>
                  <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel>Algorithm</InputLabel>
                    <Select
                      label="Algorithm"
                      value={binding.algorithm}
                      onChange={(event) => setBinding.mutate({
                        areaId, role, data: { entityId: binding.entityId, algorithm: event.target.value as AreaActuatorBinding["algorithm"] },
                      })}
                    >
                      <MenuItem value="hysteresis">Hysteresis</MenuItem>
                      <MenuItem value="pid">PID</MenuItem>
                    </Select>
                  </FormControl>
                  {binding.algorithm === "pid" && (["kp", "ki", "kd", "windowSeconds"] as const).map((field) => (
                    <TextField
                      key={field}
                      size="small"
                      type="number"
                      label={field === "windowSeconds" ? "Window (s)" : field.toUpperCase()}
                      value={binding[field]}
                      inputProps={{ min: 0, step: field === "windowSeconds" ? 1 : 0.01 }}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && value >= 0) {
                          setBinding.mutate({ areaId, role, data: { entityId: binding.entityId, [field]: value } });
                        }
                      }}
                      sx={{ width: field === "windowSeconds" ? 105 : 75 }}
                    />
                  ))}
                  <FormControl size="small" sx={{ minWidth: 105 }}>
                    <InputLabel>Fail-safe</InputLabel>
                    <Select
                      label="Fail-safe"
                      value={binding.failSafe}
                      onChange={(event) => setBinding.mutate({
                        areaId, role, data: { entityId: binding.entityId, failSafe: event.target.value as AreaActuatorBinding["failSafe"] },
                      })}
                    >
                      <MenuItem value="hold">Hold</MenuItem>
                      <MenuItem value="off">Off</MenuItem>
                      <MenuItem value="on">On</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControlLabel
                    sx={{ mr: 0 }}
                    control={<Switch size="small" color="warning" checked={isManual(binding)}
                      onChange={(_, enabled) => override.mutate({ areaId, role, enabled, expiryMinutes })} />}
                    label={<Typography variant="caption" color={isManual(binding) ? "warning.main" : "textSecondary"}>
                      {isManual(binding) ? `Override${remaining(binding)}` : "Override"}
                    </Typography>}
                  />
                  {binding.state === "unavailable" || binding.state === "unknown" ? (
                    <Typography variant="caption" color="error.main">Fail-safe pending</Typography>
                  ) : null}
                  <Switch
                    size="small"
                    checked={binding.state === "on"}
                    onChange={(_, checked) => manual.mutate({
                      areaId, role, on: checked, expiryMinutes: expiry ? Number(expiry) : undefined,
                    })}
                  />
                  <Button size="small" color="error" startIcon={<Delete />} onClick={() => deleteBinding.mutate({ areaId, role })}>Remove</Button>
                </>}
              </Box>
            );
          })}
          {entities.isError && <Alert severity="warning">Home Assistant entities unavailable.</Alert>}
          {bindings.isError && <Alert severity="warning">Actuator bindings unavailable.</Alert>}
        </Box>
      )}
    </Paper>
  );
};

export default AreaActuatorBindings;
