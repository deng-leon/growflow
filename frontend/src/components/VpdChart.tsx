import React, { useMemo, useRef, useState } from "react";
import { Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { AreaSensorReading } from "../types/models";
import {
  calculateVPD,
  classifyVPD,
  relativeHumidityForVPD,
  VPD_ZONE_COLORS,
} from "../utils/vpd";

const TEMP_MIN = 15;
const TEMP_MAX = 35;
const RH_MIN = 20;
const RH_MAX = 100;
const WIDTH = 720;
const HEIGHT = 330;
const PADDING = { left: 48, right: 16, top: 16, bottom: 38 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

const presets: Record<string, [number, number]> = {
  seedling: [0.4, 0.8],
  clone: [0.4, 0.8],
  veg: [0.8, 1.2],
  vegetative: [0.8, 1.2],
  flower: [1.2, 1.6],
  flowering: [1.2, 1.6],
};

const xForTemperature = (temperature: number) =>
  PADDING.left + ((temperature - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * PLOT_WIDTH;
const yForHumidity = (humidity: number) =>
  PADDING.top + ((RH_MAX - humidity) / (RH_MAX - RH_MIN)) * PLOT_HEIGHT;
const temperatureForX = (x: number) =>
  TEMP_MIN + ((x - PADDING.left) / PLOT_WIDTH) * (TEMP_MAX - TEMP_MIN);
const humidityForY = (y: number) =>
  RH_MAX - ((y - PADDING.top) / PLOT_HEIGHT) * (RH_MAX - RH_MIN);

export interface VpdChartProps {
  leafOffsetC: number;
  vpdMin: number | null | undefined;
  vpdMax: number | null | undefined;
  phaseName: string;
  readings?: AreaSensorReading[];
  onLeafOffsetChange: (value: number) => void;
  onCorridorChange: (min: number, max: number) => void;
}

const VpdChart: React.FC<VpdChartProps> = ({
  leafOffsetC,
  vpdMin,
  vpdMax,
  phaseName,
  readings = [],
  onLeafOffsetChange,
  onCorridorChange,
}) => {
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const min = vpdMin ?? 0.8;
  const max = vpdMax ?? 1.2;
  const temperature = readings.find((reading) => reading.role === "temperature")?.value ?? null;
  const humidity = readings.find((reading) => reading.role === "humidity")?.value ?? null;
  const liveVpd = temperature != null && humidity != null
    ? calculateVPD(temperature, humidity, leafOffsetC)
    : null;

  const cells = useMemo(() => {
    const columns = 20;
    const rows = 16;
    return Array.from({ length: columns * rows }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const temp = TEMP_MIN + ((column + 0.5) / columns) * (TEMP_MAX - TEMP_MIN);
      const rh = RH_MAX - ((row + 0.5) / rows) * (RH_MAX - RH_MIN);
      return {
        x: PADDING.left + (column / columns) * PLOT_WIDTH,
        y: PADDING.top + (row / rows) * PLOT_HEIGHT,
        width: PLOT_WIDTH / columns + 0.5,
        height: PLOT_HEIGHT / rows + 0.5,
        fill: VPD_ZONE_COLORS[classifyVPD(calculateVPD(temp, rh, leafOffsetC))],
      };
    });
  }, [leafOffsetC]);

  const contourPoints = (vpd: number) =>
    Array.from({ length: 41 }, (_, index) => {
      const temp = TEMP_MIN + (index / 40) * (TEMP_MAX - TEMP_MIN);
      const rh = relativeHumidityForVPD(temp, vpd, leafOffsetC);
      return `${xForTemperature(temp)},${yForHumidity(rh)}`;
    }).join(" ");

  const updateFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const temp = temperatureForX(PADDING.left + PLOT_WIDTH / 2);
    const rh = humidityForY(y);
    const value = Math.max(0, Math.min(3, calculateVPD(temp, rh, leafOffsetC)));
    if (dragging === "min") onCorridorChange(Math.min(value, max - 0.05), max);
    else onCorridorChange(min, Math.max(value, min + 0.05));
  };

  const endDrag = () => setDragging(null);

  const applyPreset = () => {
    const key = phaseName.toLowerCase();
    const preset = Object.entries(presets).find(([name]) => key.includes(name))?.[1] ?? presets.veg;
    onCorridorChange(preset[0], preset[1]);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} sx={{ mb: 1 }}>
        <Typography variant="subtitle2">VPD corridor</Typography>
        <TextField
          size="small"
          type="number"
          label="Leaf offset (°C)"
          value={leafOffsetC}
          onChange={(event) => onLeafOffsetChange(Number(event.target.value))}
          inputProps={{ step: 0.5 }}
          sx={{ width: 145 }}
        />
        <Button size="small" variant="outlined" onClick={applyPreset}>Use phase preset</Button>
        <Chip size="small" label={`${min.toFixed(2)}–${max.toFixed(2)} kPa`} color="success" variant="outlined" />
      </Stack>
      <Box sx={{ overflowX: "auto", borderRadius: 1, bgcolor: "background.default" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Temperature and relative humidity VPD chart"
          style={{ display: "block", width: "100%", minWidth: 560, touchAction: "none" }}
          onPointerMove={updateFromPointer}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          {cells.map((cell, index) => <rect key={index} {...cell} opacity={0.8} />)}
          <polyline points={contourPoints(min)} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="7 4" />
          <polyline points={contourPoints(max)} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="7 4" />
          <polyline points={contourPoints(min)} fill="none" stroke="#185abc" strokeWidth="1" />
          <polyline points={contourPoints(max)} fill="none" stroke="#185abc" strokeWidth="1" />
          <text x={PADDING.left + 5} y={PADDING.top + 14} fill="white" fontSize="12">RH %</text>
          {[15, 20, 25, 30, 35].map((value) => (
            <text key={value} x={xForTemperature(value)} y={HEIGHT - 12} fill="white" fontSize="11" textAnchor="middle">{value}°C</text>
          ))}
          {[20, 40, 60, 80, 100].map((value) => (
            <text key={value} x={PADDING.left - 8} y={yForHumidity(value) + 4} fill="white" fontSize="11" textAnchor="end">{value}</text>
          ))}
          <circle
            cx={xForTemperature(temperature ?? 25)}
            cy={yForHumidity(humidity ?? 60)}
            r="7"
            fill="#fff"
            stroke="#111"
            strokeWidth="2"
            opacity={temperature != null && humidity != null ? 1 : 0.35}
          />
          <circle cx={xForTemperature(temperature ?? 25)} cy={yForHumidity(humidity ?? 60)} r="2.5" fill="#111" opacity={temperature != null && humidity != null ? 1 : 0.35} />
          <circle
            cx={xForTemperature(25)}
            cy={yForHumidity(relativeHumidityForVPD(25, min, leafOffsetC))}
            r="8"
            fill="#185abc"
            stroke="white"
            strokeWidth="2"
            cursor="ns-resize"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging("min"); }}
          />
          <circle
            cx={xForTemperature(25)}
            cy={yForHumidity(relativeHumidityForVPD(25, max, leafOffsetC))}
            r="8"
            fill="#185abc"
            stroke="white"
            strokeWidth="2"
            cursor="ns-resize"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging("max"); }}
          />
        </svg>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Background zones: &lt;0.4 under-transpiration · 0.4–0.8 propagation · 0.8–1.2 vegetative · 1.2–1.6 flowering · &gt;1.6 danger.
        {liveVpd != null && ` Live VPD: ${liveVpd.toFixed(2)} kPa.`}
      </Typography>
    </Box>
  );
};

export default VpdChart;
