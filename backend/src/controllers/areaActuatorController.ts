import { Router, Request } from "express";
import { prisma } from "../database";
import { haClient, HAState } from "../services/haClient";
import { setActuatorOutput } from "../services/actuatorOutput";

export const ACTUATOR_ROLES = ["light", "humidifier", "dehumidifier", "ventilation", "fan"] as const;
export type ActuatorRole = typeof ACTUATOR_ROLES[number];
export const ALGORITHMS = ["hysteresis", "pid"] as const;
export const FAIL_SAFES = ["hold", "off", "on"] as const;

type BindingState = { role: string; entityId: string; speedEntityId?: string | null };

export const buildActuatorState = (binding: BindingState, states: HAState[]) => ({
  role: binding.role,
  entityId: binding.entityId,
  state: states.find((state) => state.entity_id === binding.entityId)?.state ?? "unknown",
  ...(binding.speedEntityId ? {
    speedPercent: Number(states.find((state) => state.entity_id === binding.speedEntityId)?.attributes?.percentage) || null,
  } : {}),
});

const router = Router();
const parseAreaId = (req: Request) => Number.parseInt(req.params.id, 10);
const validRole = (role: unknown): role is ActuatorRole =>
  typeof role === "string" && ACTUATOR_ROLES.includes(role as ActuatorRole);
const areaExists = (areaId: number) => prisma.growArea.findUnique({ where: { id: areaId }, select: { id: true } });

export const clearExpiredManual = async (areaId: number, now = new Date()) => {
  const expired = await prisma.areaActuatorBinding.findMany({
    where: { areaId, manual: true, manualUntil: { lte: now } },
  });
  for (const binding of expired) {
    await prisma.areaActuatorBinding.update({ where: { id: binding.id }, data: { manual: false, manualUntil: null } });
    await prisma.actionLog.create({
      data: { areaId, role: binding.role, entityId: binding.entityId, action: "resume", reason: "manual-expired", source: "controller" },
    });
  }
};

const parseExpiry = (expiryMinutes: unknown) =>
  expiryMinutes === undefined || expiryMinutes === null || (typeof expiryMinutes === "number" && expiryMinutes >= 0 && Number.isFinite(expiryMinutes));

const setOverride = async (areaId: number, enabled: boolean, expiryMinutes: number | undefined, role?: ActuatorRole) => {
  const manualUntil = enabled && expiryMinutes ? new Date(Date.now() + expiryMinutes * 60_000) : null;
  const where = { areaId, ...(role ? { role } : {}) };
  const bindings = await prisma.areaActuatorBinding.findMany({ where });
  await prisma.areaActuatorBinding.updateMany({ where, data: { manual: enabled, manualUntil } });
  for (const binding of bindings) {
    await prisma.actionLog.create({
      data: {
        areaId, role: binding.role, entityId: binding.entityId, action: enabled ? "override" : "resume",
        reason: enabled ? "Manual override enabled" : "Manual override disabled", source: "manual",
      },
    });
  }
  return prisma.areaActuatorBinding.findMany({ where: { areaId }, orderBy: { role: "asc" } });
};

router.put("/:id/actuators/override", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const { enabled, expiryMinutes } = req.body;
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
    if (!parseExpiry(expiryMinutes)) return res.status(400).json({ error: "expiryMinutes must be a non-negative number" });
    if (!(await areaExists(areaId))) return res.status(404).json({ error: "Area not found" });
    res.json(await setOverride(areaId, enabled, expiryMinutes));
  } catch {
    res.status(500).json({ error: "Failed to set override" });
  }
});

router.put("/:id/actuators/:role/override", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const role = req.params.role;
    const { enabled, expiryMinutes } = req.body;
    if (!validRole(role)) return res.status(400).json({ error: "Invalid actuator role" });
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
    if (!parseExpiry(expiryMinutes)) return res.status(400).json({ error: "expiryMinutes must be a non-negative number" });
    if (!(await prisma.areaActuatorBinding.findUnique({ where: { areaId_role: { areaId, role } } }))) {
      return res.status(404).json({ error: "Actuator binding not found" });
    }
    res.json(await setOverride(areaId, enabled, expiryMinutes, role));
  } catch {
    res.status(500).json({ error: "Failed to set override" });
  }
});

router.get("/:id/actuators", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    if (!(await areaExists(areaId))) return res.status(404).json({ error: "Area not found" });
    await clearExpiredManual(areaId);
    const bindings = await prisma.areaActuatorBinding.findMany({ where: { areaId }, orderBy: { role: "asc" } });
    const states = await haClient.listEntities().catch(() => []);
    res.json(bindings.map((binding) => ({ ...binding, state: buildActuatorState(binding, states).state })));
  } catch {
    res.status(500).json({ error: "Failed to fetch actuator bindings" });
  }
});

router.put("/:id/actuators/:role", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const role = req.params.role;
      const { entityId, speedEntityId, maxSpeedPercent, algorithm, failSafe, minOnSeconds, minOffSeconds, kp, ki, kd, windowSeconds } = req.body;
    if (!validRole(role)) return res.status(400).json({ error: "Invalid actuator role" });
    if (typeof entityId !== "string" || !entityId.trim()) return res.status(400).json({ error: "entityId is required" });
    if (speedEntityId !== undefined && speedEntityId !== null
      && (typeof speedEntityId !== "string" || !/^fan\.[^.]+$/.test(speedEntityId.trim()))) {
      return res.status(400).json({ error: "speedEntityId must be a fan.* entity" });
    }
    if (speedEntityId && role !== "ventilation" && role !== "fan") {
      return res.status(400).json({ error: "speedEntityId is only supported for ventilation and fan roles" });
    }
    if (maxSpeedPercent !== undefined && (!Number.isInteger(maxSpeedPercent) || maxSpeedPercent < 1 || maxSpeedPercent > 100)) {
      return res.status(400).json({ error: "maxSpeedPercent must be an integer between 1 and 100" });
    }
    if (algorithm !== undefined && !ALGORITHMS.includes(algorithm)) return res.status(400).json({ error: "Invalid algorithm" });
    if (failSafe !== undefined && !FAIL_SAFES.includes(failSafe)) return res.status(400).json({ error: "Invalid fail-safe" });
    for (const [name, value] of Object.entries({ kp, ki, kd })) {
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        return res.status(400).json({ error: `${name} must be a non-negative number` });
      }
    }
    if (windowSeconds !== undefined && (typeof windowSeconds !== "number" || !Number.isInteger(windowSeconds) || windowSeconds < 1)) {
      return res.status(400).json({ error: "windowSeconds must be a positive integer" });
    }
    if (!(await areaExists(areaId))) return res.status(404).json({ error: "Area not found" });
    const binding = await prisma.areaActuatorBinding.upsert({
      where: { areaId_role: { areaId, role } },
      create: { areaId, role, entityId: entityId.trim(), speedEntityId: speedEntityId?.trim() || null, ...(maxSpeedPercent !== undefined && { maxSpeedPercent }), ...(algorithm && { algorithm }), ...(failSafe && { failSafe }), ...(minOnSeconds !== undefined && { minOnSeconds }), ...(minOffSeconds !== undefined && { minOffSeconds }), ...(kp !== undefined && { kp }), ...(ki !== undefined && { ki }), ...(kd !== undefined && { kd }), ...(windowSeconds !== undefined && { windowSeconds }) },
      update: { entityId: entityId.trim(), ...(speedEntityId !== undefined && { speedEntityId: speedEntityId?.trim() || null }), ...(maxSpeedPercent !== undefined && { maxSpeedPercent }), ...(algorithm !== undefined && { algorithm }), ...(failSafe !== undefined && { failSafe }), ...(minOnSeconds !== undefined && { minOnSeconds }), ...(minOffSeconds !== undefined && { minOffSeconds }), ...(kp !== undefined && { kp }), ...(ki !== undefined && { ki }), ...(kd !== undefined && { kd }), ...(windowSeconds !== undefined && { windowSeconds }) },
    });
    res.json(binding);
  } catch {
    res.status(500).json({ error: "Failed to save actuator binding" });
  }
});

router.delete("/:id/actuators/:role", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const role = req.params.role;
    if (!validRole(role)) return res.status(400).json({ error: "Invalid actuator role" });
    const binding = await prisma.areaActuatorBinding.findUnique({ where: { areaId_role: { areaId, role } } });
    if (!binding) return res.status(404).json({ error: "Actuator binding not found" });
    await prisma.areaActuatorBinding.delete({ where: { id: binding.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete actuator binding" });
  }
});

router.post("/:id/actuators/:role/manual", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    const role = req.params.role;
    const { on, expiryMinutes } = req.body;
    if (!validRole(role)) return res.status(400).json({ error: "Invalid actuator role" });
    if (typeof on !== "boolean") return res.status(400).json({ error: "on must be boolean" });
    const binding = await prisma.areaActuatorBinding.findUnique({ where: { areaId_role: { areaId, role } } });
    if (!binding) return res.status(404).json({ error: "Actuator binding not found" });
    if (expiryMinutes !== undefined && (typeof expiryMinutes !== "number" || expiryMinutes < 0)) {
      return res.status(400).json({ error: "expiryMinutes must be a non-negative number" });
    }
    await setActuatorOutput(binding, {
      on,
      ...(on && binding.speedEntityId ? {
        speedPercent: binding.maxSpeedPercent,
      } : {}),
    }, haClient);
    const manualUntil = expiryMinutes ? new Date(Date.now() + expiryMinutes * 60_000) : null;
    const updated = await prisma.areaActuatorBinding.update({
      where: { id: binding.id },
      data: { manual: true, manualUntil },
    });
    const log = await prisma.actionLog.create({
      data: { areaId, role, entityId: binding.entityId, action: on ? "on" : "off", reason: "Manual override", source: "manual" },
    });
    res.json({ binding: updated, actionLog: log });
  } catch {
    res.status(503).json({ error: "Failed to control actuator" });
  }
});

router.get("/:id/action-log", async (req, res) => {
  try {
    const areaId = parseAreaId(req);
    if (!(await areaExists(areaId))) return res.status(404).json({ error: "Area not found" });
    res.json(await prisma.actionLog.findMany({ where: { areaId }, orderBy: { createdAt: "desc" }, take: 100 }));
  } catch {
    res.status(500).json({ error: "Failed to fetch action log" });
  }
});

export { router as areaActuatorRoutes };
