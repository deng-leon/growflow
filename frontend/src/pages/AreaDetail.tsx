import React, { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  IconButton,
  Fab,
  Grid,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Tooltip,
  Select,
  FormControl,
  InputLabel,
  TextField,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  MoreVert,
  LocalFlorist,
  SwapHoriz,
  FlashOn,
  WarningAmber,
  AccessTime,
} from "@mui/icons-material";
import {
  useArea,
  useUpdateArea,
  useDeleteArea,
  useCreateAreaEvent,
  useUpdateAreaEvent,
  useDeleteAreaEvent,
  useFlipArea,
  useAreaPhaseSettings,
  useAreaSensorReadings,
  useAreaHistory,
  useAreaActionLog,
} from "../hooks/useAreas";
import CreateAreaDialog, { AREA_TYPES, LIGHT_SCHEDULE_PRESETS } from "../components/CreateAreaDialog";
import EnvironmentEventDialog from "../components/EnvironmentEventDialog";
import AreaSensorBindings from "../components/AreaSensorBindings";
import AreaActuatorBindings from "../components/AreaActuatorBindings";
import AreaPhaseSettingsEditor from "../components/AreaPhaseSettingsEditor";
import { AreaEvent, CreateAreaEventRequest, CreateAreaRequest, Plant, AreaHistory, ActionLog } from "../types/models";
import { createPlantTimeline } from "../utils/PlantTimeline";
import { calculateVPD } from "../utils/vpd";
import { evaluatePlantHappiness } from "../utils/plantEnvironment";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

const formatTimestamp = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
};

type RangeKey = "1h" | "6h" | "24h" | "7d" | "30d" | "grow" | "custom";
const RANGE_OPTIONS: { value: RangeKey; label: string; hours?: number }[] = [
  { value: "1h", label: "1 hour", hours: 1 },
  { value: "6h", label: "6 hours", hours: 6 },
  { value: "24h", label: "24 hours", hours: 24 },
  { value: "7d", label: "7 days", hours: 24 * 7 },
  { value: "30d", label: "30 days", hours: 24 * 30 },
  { value: "grow", label: "Whole grow" },
  { value: "custom", label: "Custom range" },
];

const bucketCountFor = (range: RangeKey) => range === "1h" ? 30 : range === "6h" ? 48 : range === "24h" ? 72 : 120;

const HistoryChart: React.FC<{
  history?: AreaHistory;
  role: "temperature" | "humidity" | "vpd";
  label: string;
  unit: string;
  color: string;
  targetMin?: number | null;
  targetMax?: number | null;
  actionLogs: ActionLog[];
  events: AreaEvent[];
  onEventClick?: (event: AreaEvent) => void;
}> = ({ history, role, label, unit, color, targetMin, targetMax, actionLogs, events, onEventClick }) => {
  const data = (history?.buckets || []).map((bucket) => ({
    time: new Date(bucket.start).getTime(),
    label: bucket.start,
    avg: bucket.readings[role]?.avg ?? null,
    min: bucket.readings[role]?.min ?? null,
    max: bucket.readings[role]?.max ?? null,
  }));
  const hasData = data.some((point) => point.avg !== null);
  const markers = [
    ...actionLogs.map((log) => ({ time: new Date(log.createdAt).getTime(), text: `${log.role} ${log.action}`, color: log.action === "on" ? "#4caf50" : "#f44336", event: undefined })),
    ...events.map((event) => ({ time: new Date(event.timestamp).getTime(), text: event.title, color: "#ff9800", event })),
  ];

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{label} ({unit})</Typography>
      {!hasData ? (
        <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: "center" }}>
          No {label.toLowerCase()} history in this range.
        </Typography>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
            <YAxis tickFormatter={(value) => `${value}${unit}`} width={52} />
            <ChartTooltip labelFormatter={(value) => formatTimestamp(new Date(value).toISOString())} formatter={(value: number) => [`${value.toFixed(2)}${unit}`, label]} />
            <Legend />
            {targetMin != null && targetMax != null && (
              <ReferenceArea y1={targetMin} y2={targetMax} fill="#4caf50" fillOpacity={0.12} />
            )}
            {markers.map((marker, index) => (
              <ReferenceLine
                key={`${marker.time}-${index}`}
                x={marker.time}
                stroke={marker.color}
                strokeDasharray="4 4"
                label={{ value: marker.text, angle: -90, position: "insideTop", fontSize: 10 }}
                onClick={() => marker.event && onEventClick?.(marker.event)}
                style={marker.event ? { cursor: "pointer" } : undefined}
              />
            ))}
            <Line type="monotone" dataKey="avg" name="Average" stroke={color} dot={false} connectNulls />
            <Line type="monotone" dataKey="min" name="Min" stroke={color} strokeOpacity={0.35} dot={false} connectNulls />
            <Line type="monotone" dataKey="max" name="Max" stroke={color} strokeOpacity={0.35} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Box>
  );
};

const AreaDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const areaId = id ? parseInt(id) : 0;

  const { data: area, isLoading, error } = useArea(areaId);
  const updateArea = useUpdateArea();
  const deleteArea = useDeleteArea();
  const createEvent = useCreateAreaEvent();
  const updateEvent = useUpdateAreaEvent();
  const deleteEvent = useDeleteAreaEvent();
  const flipArea = useFlipArea();
  const phaseSettings = useAreaPhaseSettings(areaId);
  const sensorReadings = useAreaSensorReadings(areaId);

  const [eventDialog, setEventDialog] = useState<{ open: boolean; event: AreaEvent | null }>({
    open: false,
    event: null,
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [flipDialog, setFlipDialog] = useState<{ open: boolean; newSchedule: string }>({
    open: false,
    newSchedule: "12/12",
  });
  const [transitionPlants, setTransitionPlants] = useState(true);
  const [range, setRange] = useState<RangeKey>("24h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const events: AreaEvent[] = area?.events || [];
  const plants: Plant[] = area?.plants || [];
  const historyRange = useMemo(() => {
    const now = new Date();
    const selected = RANGE_OPTIONS.find((option) => option.value === range);
    const to = range === "custom" && customTo ? new Date(customTo) : now;
    const from = range === "custom" && customFrom
      ? new Date(customFrom)
      : range === "grow"
        ? new Date(area?.createdAt || now.getTime())
        : new Date(to.getTime() - (selected?.hours || 24) * 60 * 60 * 1000);
    return { from, to, buckets: bucketCountFor(range) };
  }, [area?.createdAt, customFrom, customTo, range]);
  const history = useAreaHistory(areaId, {
    from: historyRange.from.toISOString(),
    to: historyRange.to.toISOString(),
    buckets: historyRange.buckets,
  });
  const actionLog = useAreaActionLog(areaId, historyRange.from.toISOString(), historyRange.to.toISOString());

  const latestEnv = useMemo(
    () => events.find((e) => e.type === "environment"),
    [events]
  );

  // Area-level VPD: raw sensor reading. Per-plant judgement happens below in
  // the plants list via evaluatePlantHappiness.
  const vpdValue = useMemo(() => {
    if (!latestEnv?.data) return null;
    const { temperature_c, humidity_percent } = latestEnv.data;
    return temperature_c !== undefined && humidity_percent !== undefined
      ? calculateVPD(temperature_c, humidity_percent)
      : null;
  }, [latestEnv]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !area) {
    return <Alert severity="error">Failed to load area.</Alert>;
  }

  const typeIcon = AREA_TYPES.find((t) => t.value === area.type)?.icon || "📦";

  const handleUpdateArea = async (data: CreateAreaRequest) => {
    await updateArea.mutateAsync({ id: area.id, data });
  };

  const handleDeleteArea = async () => {
    if (!window.confirm(`Delete "${area.name}"? Plants will be unassigned but kept.`)) return;
    await deleteArea.mutateAsync(area.id);
    navigate("/areas");
  };

  const handleCreateEvent = async (data: CreateAreaEventRequest) => {
    await createEvent.mutateAsync({ areaId: area.id, data });
  };

  const handleUpdateEvent = async (data: CreateAreaEventRequest) => {
    if (!eventDialog.event) return;
    await updateEvent.mutateAsync({ areaId: area.id, eventId: eventDialog.event.id, data });
  };

  const handleDeleteEvent = async (eventId: number) => {
    await deleteEvent.mutateAsync({ areaId: area.id, eventId });
  };

  const handleFlip = async () => {
    await flipArea.mutateAsync({
      areaId: area.id,
      newSchedule: flipDialog.newSchedule,
      transitionPlants,
    });
    setFlipDialog({ open: false, newSchedule: "12/12" });
  };

  const isVegSchedule = area.lightSchedule && parseInt(area.lightSchedule.split("/")[0] || "0") >= 16;
  const photoperiodPlants = plants.filter((p) => !p.strain || p.strain.type === "photoperiod");
  const currentPhase = plants[0] ? createPlantTimeline(plants[0].phases || [], plants[0].events || []).currentPhase : null;
  const areaSetting = currentPhase ? phaseSettings.data?.find((item) => item.phaseName === currentPhase.name) : undefined;
  const liveReading = (role: "temperature" | "humidity" | "vpd") =>
    sensorReadings.data?.find((reading) => reading.role === role)?.value ?? null;
  const target = (key: "temp" | "humidity" | "vpd") => {
    const min = areaSetting?.[`${key}Min` as keyof typeof areaSetting] ?? currentPhase?.[`${key}Min` as keyof typeof currentPhase];
    const max = areaSetting?.[`${key}Max` as keyof typeof areaSetting] ?? currentPhase?.[`${key}Max` as keyof typeof currentPhase];
    return min != null || max != null ? `${min ?? "—"}–${max ?? "—"}` : null;
  };
  const targetBounds = (key: "temp" | "humidity" | "vpd") => ({
    targetMin: (areaSetting?.[`${key}Min` as keyof typeof areaSetting] ?? currentPhase?.[`${key}Min` as keyof typeof currentPhase]) as number | null | undefined,
    targetMax: (areaSetting?.[`${key}Max` as keyof typeof areaSetting] ?? currentPhase?.[`${key}Max` as keyof typeof currentPhase]) as number | null | undefined,
  });
  const chartEvents = events.filter((event) => {
    const timestamp = new Date(event.timestamp).getTime();
    return timestamp >= historyRange.from.getTime() && timestamp <= historyRange.to.getTime();
  });

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 1.75,
              bgcolor: "rgba(76,175,80,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              flexShrink: 0,
            }}
          >
            {typeIcon}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h4" noWrap>
              {area.name}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              <Chip label={area.type} size="small" sx={{ textTransform: "capitalize" }} />
              {area.lightSchedule && (
                <Chip label={`💡 ${area.lightSchedule}`} size="small" color="warning" variant="outlined" />
              )}
              <Chip
                icon={<LocalFlorist />}
                label={`${plants.length} plants`}
                size="small"
                color="primary"
                variant="outlined"
              />
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            {isVegSchedule && photoperiodPlants.length > 0 && (
              <Button
                variant="contained"
                color="warning"
                startIcon={<FlashOn />}
                onClick={() => setFlipDialog({ open: true, newSchedule: "12/12" })}
              >
                Flip to 12/12
              </Button>
            )}
            <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
              <MoreVert />
            </IconButton>
          </Box>
        </Box>
        {area.description && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1.5 }}>
            {area.description}
          </Typography>
        )}
      </Paper>

      <Grid container spacing={3}>
        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          <AreaSensorBindings areaId={area.id} />
          <AreaActuatorBindings areaId={area.id} />
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Typography
              variant="overline"
              color="textSecondary"
              sx={{ display: "block", mb: 1 }}
            >
              Current Conditions
            </Typography>
            {latestEnv?.data ? (
              <Box sx={{ mt: 1 }}>
                <Grid container spacing={2}>
                  {latestEnv.data.temperature_c !== undefined && (
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">
                        Temperature
                      </Typography>
                      <Typography variant="h5">{liveReading("temperature") ?? latestEnv.data.temperature_c}°C</Typography>
                      {target("temp") && <Typography variant="caption" color="textSecondary">Target: {target("temp")}°C</Typography>}
                    </Grid>
                  )}
                  {latestEnv.data.humidity_percent !== undefined && (
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">
                        Humidity
                      </Typography>
                      <Typography variant="h5">{liveReading("humidity") ?? latestEnv.data.humidity_percent}%</Typography>
                      {target("humidity") && <Typography variant="caption" color="textSecondary">Target: {target("humidity")}%</Typography>}
                    </Grid>
                  )}
                  {vpdValue !== null && (
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">
                        VPD
                      </Typography>
                      <Typography variant="h5">{liveReading("vpd") ?? vpdValue} kPa</Typography>
                      {target("vpd") && <Typography variant="caption" color="textSecondary">Target: {target("vpd")} kPa</Typography>}
                    </Grid>
                  )}
                  {latestEnv.data.co2_ppm !== undefined && (
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary">
                        CO₂
                      </Typography>
                      <Typography variant="h5">{latestEnv.data.co2_ppm} ppm</Typography>
                    </Grid>
                  )}
                </Grid>
                <Typography variant="caption" color="textSecondary" sx={{ display: "block", mt: 1.5 }}>
                  Last updated: {formatTimestamp(latestEnv.timestamp)} ({latestEnv.source})
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                No environment data yet. Log your first reading →
              </Typography>
            )}
          </Paper>

          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Typography
              variant="overline"
              color="textSecondary"
              sx={{ display: "block", mb: 1 }}
            >
              Action Log
            </Typography>
            {actionLog.isLoading ? (
              <CircularProgress size={22} />
            ) : actionLog.error ? (
              <Alert severity="error">Failed to load controller actions.</Alert>
            ) : actionLog.data?.length ? (
              <List dense disablePadding>
                {actionLog.data.slice(0, 8).map((log) => (
                  <ListItemButton key={log.id} disableGutters sx={{ borderRadius: 1 }}>
                    <AccessTime fontSize="small" sx={{ mr: 1, color: "text.secondary" }} />
                    <ListItemText
                      primary={`${log.role}: ${log.action}`}
                      secondary={`${formatTimestamp(log.createdAt)} · ${log.source}${log.reason ? ` · ${log.reason}` : ""}`}
                    />
                  </ListItemButton>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="textSecondary">
                No controller or manual actions recorded yet.
              </Typography>
            )}
          </Paper>

          <Paper sx={{ p: 2.5 }}>
            <Typography
              variant="overline"
              color="textSecondary"
              sx={{ display: "block", mb: 1 }}
            >
              Plants in Area ({plants.length})
            </Typography>
            {plants.length === 0 ? (
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                No plants assigned. Assign plants from their detail page.
              </Typography>
            ) : (
              <List dense sx={{ mt: 0.5 }}>
                {plants.map((plant) => {
                  const timeline = createPlantTimeline(plant.phases || [], plant.events || []);
                  const currentPhaseName = timeline.currentPhase?.name;
                  const happiness = evaluatePlantHappiness(plant, area);
                  const unhappy = happiness.overall === "unhappy";
                  const warn = happiness.overall === "mostly-happy";
                  return (
                    <ListItemButton
                      key={plant.id}
                      onClick={() => navigate(`/plant/${plant.id}`)}
                      sx={{ borderRadius: 1 }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <span>{plant.name}</span>
                            {(unhappy || warn) && (
                              <Tooltip title={happiness.summary}>
                                <WarningAmber sx={{ fontSize: 14, color: unhappy ? "error.main" : "warning.main" }} />
                              </Tooltip>
                            )}
                          </Box>
                        }
                        secondary={`${plant.strain?.name || "No strain"} · ${currentPhaseName || "—"}${happiness.overall !== "unknown" ? ` · ${happiness.summary}` : ""}`}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Main content: sensor history */}
        <Grid item xs={12} md={8}>
          <AreaPhaseSettingsEditor areaId={area.id} plants={plants} />
          <Paper sx={{ p: 2.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography variant="h6">Environment History</Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Add />}
                onClick={() => setEventDialog({ open: true, event: null })}
              >
                Log Event
              </Button>
            </Box>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="history-range-label">Timescale</InputLabel>
                <Select
                  native
                  labelId="history-range-label"
                  label="Timescale"
                  value={range}
                  onChange={(event) => setRange(event.target.value as RangeKey)}
                >
                  {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </FormControl>
              {range === "custom" && (
                <>
                  <TextField
                    size="small"
                    type="datetime-local"
                    label="From"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    size="small"
                    type="datetime-local"
                    label="To"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </>
              )}
            </Box>
            {history.isLoading ? (
              <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
            ) : history.error ? (
              <Alert severity="error">Failed to load sensor history.</Alert>
            ) : !history.data?.buckets?.some((bucket) => Object.values(bucket.readings).some(Boolean)) ? (
              <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography variant="body1" color="textSecondary">No sensor history in this range.</Typography>
                <Typography variant="body2" color="textSecondary">Bind a temperature or humidity sensor and allow it to collect readings.</Typography>
              </Box>
            ) : (
              <Box>
                <HistoryChart history={history.data} role="temperature" label="Temperature" unit="°C" color="#f44336" {...targetBounds("temp")} actionLogs={actionLog.data || []} events={chartEvents} onEventClick={(event) => setEventDialog({ open: true, event })} />
                <HistoryChart history={history.data} role="humidity" label="Humidity" unit="%" color="#2196f3" {...targetBounds("humidity")} actionLogs={actionLog.data || []} events={chartEvents} onEventClick={(event) => setEventDialog({ open: true, event })} />
                <HistoryChart history={history.data} role="vpd" label="VPD" unit=" kPa" color="#ab47bc" {...targetBounds("vpd")} actionLogs={actionLog.data || []} events={chartEvents} onEventClick={(event) => setEventDialog({ open: true, event })} />
                {(history.isFetching || actionLog.isFetching) && <Typography variant="caption" color="textSecondary">Refreshing history…</Typography>}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* FAB */}
      <Fab
        color="primary"
        sx={{ position: "fixed", bottom: 24, right: 24 }}
        onClick={() => setEventDialog({ open: true, event: null })}
      >
        <Add />
      </Fab>

      {/* Menu */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setEditDialogOpen(true);
          }}
        >
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Edit Area
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setFlipDialog({ open: true, newSchedule: area.lightSchedule === "12/12" ? "18/6" : "12/12" });
          }}
        >
          <SwapHoriz fontSize="small" sx={{ mr: 1 }} />
          Change Light Schedule
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            handleDeleteArea();
          }}
          sx={{ color: "error.main" }}
        >
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete Area
        </MenuItem>
      </Menu>

      <CreateAreaDialog
        open={editDialogOpen}
        area={area}
        onClose={() => setEditDialogOpen(false)}
        onSubmit={handleUpdateArea}
      />

      <EnvironmentEventDialog
        open={eventDialog.open}
        event={eventDialog.event}
        onClose={() => setEventDialog({ open: false, event: null })}
        onSubmit={eventDialog.event ? handleUpdateEvent : handleCreateEvent}
        onDelete={handleDeleteEvent}
      />

      {/* Flip Dialog */}
      <Dialog open={flipDialog.open} onClose={() => setFlipDialog({ ...flipDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>Change Light Schedule</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Current: {area.lightSchedule || "not set"}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            {LIGHT_SCHEDULE_PRESETS.map((preset) => (
              <Button
                key={preset}
                size="small"
                variant={flipDialog.newSchedule === preset ? "contained" : "outlined"}
                onClick={() => setFlipDialog({ ...flipDialog, newSchedule: preset })}
              >
                {preset}
              </Button>
            ))}
          </Box>
          {photoperiodPlants.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={transitionPlants}
                    onChange={(e) => setTransitionPlants(e.target.checked)}
                  />
                }
                label={`Transition ${photoperiodPlants.length} photoperiod plant(s) to next phase`}
              />
              {transitionPlants && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  All photoperiod plants in this area will advance to their next phase (typically Vegetation → Flowering).
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFlipDialog({ ...flipDialog, open: false })}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleFlip}
            disabled={!flipDialog.newSchedule || flipArea.isPending}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AreaDetail;
