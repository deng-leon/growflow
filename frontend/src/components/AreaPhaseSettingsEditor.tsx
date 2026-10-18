import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Select, TextField, Typography } from "@mui/material";
import { AreaPhaseSettings, Plant } from "../types/models";
import { useArea, useAreaPhaseSettings, useAreaSensorReadings, useUpdateArea, useUpdateAreaPhaseSettings } from "../hooks/useAreas";
import VpdChart from "./VpdChart";

const fields: { key: keyof AreaPhaseSettings; label: string; type?: string }[] = [
  { key: "tempMin", label: "Temperature min (°C)", type: "number" },
  { key: "tempMax", label: "Temperature max (°C)", type: "number" },
  { key: "humidityMin", label: "Humidity min (%)", type: "number" },
  { key: "humidityMax", label: "Humidity max (%)", type: "number" },
  { key: "lightOnTime", label: "Lights on", type: "time" },
  { key: "lightOffTime", label: "Lights off", type: "time" },
  { key: "ventilationOnMinutes", label: "Ventilation on (min)", type: "number" },
  { key: "ventilationOffMinutes", label: "Ventilation off (min)", type: "number" },
  { key: "fanSchedule", label: "Fan schedule" },
];

const DEFAULT_PHASES = ["Seedling", "Vegetation", "Flowering"];

const AreaPhaseSettingsEditor: React.FC<{ areaId: number; plants: Plant[] }> = ({ areaId, plants }) => {
  const settings = useAreaPhaseSettings(areaId);
  const area = useArea(areaId);
  const readings = useAreaSensorReadings(areaId);
  const updateArea = useUpdateArea();
  const update = useUpdateAreaPhaseSettings();
  const phaseNames = useMemo(() => {
    const names = Array.from(new Set(plants.flatMap((plant) => plant.phases.map((phase) => phase.name))));
    return names.length ? names : DEFAULT_PHASES;
  }, [plants]);
  const [phaseName, setPhaseName] = useState("");
  const [form, setForm] = useState<Partial<AreaPhaseSettings>>({});
  const [leafOffsetC, setLeafOffsetC] = useState(-2);
  const [useControlPhase, setUseControlPhase] = useState(false);

  useEffect(() => {
    if (!phaseName && phaseNames[0]) setPhaseName(phaseNames[0]);
  }, [phaseName, phaseNames]);

  useEffect(() => {
    setForm(settings.data?.find((item) => item.phaseName === phaseName) || {});
    setLeafOffsetC(area.data?.leafOffsetC ?? -2);
    setUseControlPhase(area.data?.controlPhaseName ? area.data.controlPhaseName === phaseName : plants.length === 0);
  }, [phaseName, settings.data, area.data?.controlPhaseName, area.data?.leafOffsetC, plants.length]);

  if (!phaseNames.length) return null;

  const save = () => {
    const data = {
      ...Object.fromEntries(fields.map(({ key }) => [key, form[key] === "" ? null : form[key]])),
      vpdMin: form.vpdMin ?? null,
      vpdMax: form.vpdMax ?? null,
    };
    update.mutate({ areaId, phaseName, data });
    if (area.data && area.data.leafOffsetC !== leafOffsetC) {
      updateArea.mutate({ id: areaId, data: { leafOffsetC, controlPhaseName: useControlPhase ? phaseName : null } });
    } else if (area.data?.controlPhaseName !== (useControlPhase ? phaseName : null)) {
      updateArea.mutate({ id: areaId, data: { controlPhaseName: useControlPhase ? phaseName : null } });
    }
  };

  return (
    <Paper sx={{ p: 2.5, mb: 2 }}>
      <Typography variant="overline" color="textSecondary" sx={{ display: "block", mb: 1 }}>Area Grow Settings</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Select size="small" value={phaseName} onChange={(event) => setPhaseName(event.target.value)} sx={{ minWidth: 180 }}>
          {phaseNames.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </Select>
        <FormControlLabel
          control={<Checkbox checked={useControlPhase} onChange={(_, checked) => setUseControlPhase(checked)} />}
          label="Use this phase for control when the area has no plants"
        />
        {area.data?.controlPhaseName && (
          <Typography variant="caption" color="textSecondary">
            Control phase: {area.data.controlPhaseName}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 1.25 }}>
        {fields.map(({ key, label, type }) => (
          <TextField
            key={key}
            size="small"
            label={label}
            type={type}
            value={form[key] ?? ""}
            onChange={(event) => setForm({ ...form, [key]: type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value })}
            InputLabelProps={type === "time" ? { shrink: true } : undefined}
          />
        ))}
      </Box>
      <VpdChart
        phaseName={phaseName}
        readings={readings.data}
        leafOffsetC={leafOffsetC}
        vpdMin={form.vpdMin}
        vpdMax={form.vpdMax}
        onLeafOffsetChange={setLeafOffsetC}
        onCorridorChange={(vpdMin, vpdMax) => setForm((current) => ({ ...current, vpdMin, vpdMax }))}
      />
      <Button sx={{ mt: 2 }} variant="contained" onClick={save} disabled={update.isPending}>Save settings</Button>
    </Paper>
  );
};

export default AreaPhaseSettingsEditor;
