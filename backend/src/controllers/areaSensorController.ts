import { Router, Request, Response } from "express";
import { prisma } from "../database";
import { haClient, HAState } from "../services/haClient";
import { sensorRecorder } from "../services/sensorRecorder";
import { calculateVpd } from "../utils/vpd";
import { extractClimateReadings } from "../utils/climate";

export const SENSOR_ROLES = ["temperature", "humidity", "vpd", "roomTemperature", "roomHumidity"] as const;
export type SensorRole = typeof SENSOR_ROLES[number];

const STALE_AFTER_MS = 5 * 60 * 1000;

type Binding = { role: string; entityId: string };

export const buildLiveReadings = (
  bindings: Binding[],
  states: HAState[],
  roomClimateEntityId?: string | null,
) => {
  const climate = roomClimateEntityId
    ? states.find((state) => state.entity_id === roomClimateEntityId)
    : undefined;
  const climateReadings = extractClimateReadings(climate);
  const climateUpdatedAt = climate?.last_updated || climate?.last_changed;
  const climateStale = !climate || climate.state === "unavailable" || climate.state === "unknown"
    || !climateUpdatedAt || Date.now() - new Date(climateUpdatedAt).getTime() > STALE_AFTER_MS;
  const climateBindings: Binding[] = roomClimateEntityId
    ? [
      { role: "roomTemperature", entityId: roomClimateEntityId },
      { role: "roomHumidity", entityId: roomClimateEntityId },
    ]
    : [];
  return [...bindings.filter((binding) => !roomClimateEntityId
    || (binding.role !== "roomTemperature" && binding.role !== "roomHumidity")), ...climateBindings].map((binding) => {
    const state = states.find((candidate) => candidate.entity_id === binding.entityId);
    const updatedAt = state?.last_updated || state?.last_changed;
    const stale = !state
      || state.state === "unavailable"
      || state.state === "unknown"
      || !updatedAt
      || Date.now() - new Date(updatedAt).getTime() > STALE_AFTER_MS;
    const climateValue = binding.role === "roomTemperature"
      ? climateReadings.temperature
      : binding.role === "roomHumidity" ? climateReadings.humidity : null;
    const numericValue = roomClimateEntityId && (binding.role === "roomTemperature" || binding.role === "roomHumidity")
      ? (climateStale ? null : climateValue)
      : state && !stale && Number.isFinite(Number(state.state)) ? Number(state.state) : null;

    return {
      role: binding.role,
      entityId: binding.entityId,
      value: numericValue,
      unit: binding.role === "roomHumidity" ? "%" : binding.role === "roomTemperature" ? "°C" : state?.attributes?.unit_of_measurement ?? null,
      stale: roomClimateEntityId && (binding.role === "roomTemperature" || binding.role === "roomHumidity")
        ? climateStale || climateValue === null : stale,
      updatedAt: updatedAt ?? null,
    };
  });
};

const router = Router();

const parseAreaId = (req: Request) => Number.parseInt(req.params.id, 10);
const validRole = (role: unknown): role is SensorRole =>
  typeof role === "string" && SENSOR_ROLES.includes(role as SensorRole);

router.get("/:id/sensors", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const area = await prisma.growArea.findUnique({ where: { id: areaId }, select: { id: true, roomClimateEntityId: true } });
    if (!area) return res.status(404).json({ error: "Area not found" });
    res.json(await prisma.areaSensorBinding.findMany({ where: { areaId }, orderBy: { role: "asc" } }));
  } catch {
    res.status(500).json({ error: "Failed to fetch sensor bindings" });
  }
});

router.put("/:id/sensors/:role", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const role = req.params.role;
    const { entityId } = req.body;
    if (!validRole(role)) return res.status(400).json({ error: "Invalid sensor role" });
    if (typeof entityId !== "string" || !entityId.trim()) {
      return res.status(400).json({ error: "entityId is required" });
    }
    const area = await prisma.growArea.findUnique({ where: { id: areaId }, select: { id: true } });
    if (!area) return res.status(404).json({ error: "Area not found" });
    const binding = await prisma.areaSensorBinding.upsert({
      where: { areaId_role: { areaId, role } },
      create: { areaId, role, entityId: entityId.trim() },
      update: { entityId: entityId.trim() },
    });
    void sensorRecorder.backfillSensor(areaId, role, entityId.trim()).catch(() => undefined);
    res.json(binding);
  } catch {
    res.status(500).json({ error: "Failed to save sensor binding" });
  }
});

router.delete("/:id/sensors/:role", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const role = req.params.role;
    if (!validRole(role)) return res.status(400).json({ error: "Invalid sensor role" });
    const binding = await prisma.areaSensorBinding.findUnique({
      where: { areaId_role: { areaId, role } },
    });
    if (!binding) return res.status(404).json({ error: "Sensor binding not found" });
    await prisma.areaSensorBinding.delete({ where: { id: binding.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete sensor binding" });
  }
});

router.get("/:id/readings", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const area = await prisma.growArea.findUnique({ where: { id: areaId }, select: { id: true, roomClimateEntityId: true } });
    if (!area) return res.status(404).json({ error: "Area not found" });
    const bindings = await prisma.areaSensorBinding.findMany({ where: { areaId }, orderBy: { role: "asc" } });
    res.json(buildLiveReadings(bindings, await haClient.listEntities(), area.roomClimateEntityId));
  } catch {
    res.status(503).json({ error: "Home Assistant unavailable" });
  }
});

const stat = (values: number[]) => values.length ? {
  avg: values.reduce((sum, value) => sum + value, 0) / values.length,
  min: Math.min(...values),
  max: Math.max(...values),
} : null;

router.get("/:id/history", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const area = await prisma.growArea.findUnique({ where: { id: areaId }, select: { id: true } });
    if (!area) return res.status(404).json({ error: "Area not found" });

    const now = new Date();
    const to = req.query.to ? new Date(String(req.query.to)) : now;
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const bucketCount = Math.max(1, Math.min(2000, Number.parseInt(String(req.query.buckets || "60"), 10) || 60));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return res.status(400).json({ error: "Invalid from/to range" });
    }
    const requestedRoles = String(req.query.roles || "temperature,humidity,vpd,roomTemperature,roomHumidity")
      .split(",").map((role) => role.trim()).filter((role) => SENSOR_ROLES.includes(role as SensorRole));
    const roles = requestedRoles.length ? requestedRoles : [...SENSOR_ROLES];
    const queryRoles = roles.includes("vpd")
      ? ["temperature", "humidity"]
      : roles.filter((role) => role !== "vpd");
    const readings = await prisma.sensorReading.findMany({
      where: { areaId, role: { in: queryRoles as any }, at: { gte: from, lte: to } },
      orderBy: { at: "asc" },
    });
    const width = (to.getTime() - from.getTime()) / bucketCount;
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const start = new Date(from.getTime() + index * width);
      const end = new Date(index === bucketCount - 1 ? to.getTime() : from.getTime() + (index + 1) * width);
      const values = new Map<string, number[]>();
      for (const role of SENSOR_ROLES) values.set(role, []);
      readings.forEach((reading) => {
        const bucket = Math.min(bucketCount - 1, Math.floor((reading.at.getTime() - from.getTime()) / width));
        if (bucket === index) values.get(reading.role)?.push(reading.value);
      });
      const temperature = values.get("temperature") || [];
      const humidity = values.get("humidity") || [];
      const vpdValues = temperature.length && humidity.length
        ? [calculateVpd(
          temperature.reduce((sum, value) => sum + value, 0) / temperature.length,
          humidity.reduce((sum, value) => sum + value, 0) / humidity.length,
        )]
        : [];
      const readingsByRole: Record<string, ReturnType<typeof stat>> = {};
      for (const role of roles) {
        readingsByRole[role] = stat(role === "vpd" ? vpdValues : values.get(role) || []);
      }
      return { start: start.toISOString(), end: end.toISOString(), readings: readingsByRole };
    });
    res.json({ areaId, from: from.toISOString(), to: to.toISOString(), buckets });
  } catch {
    res.status(500).json({ error: "Failed to fetch sensor history" });
  }
});

export { router as areaSensorRoutes };
