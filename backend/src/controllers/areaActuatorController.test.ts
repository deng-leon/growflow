import { buildActuatorState, ACTUATOR_ROLES, clearExpiredManual } from "./areaActuatorController";
import { prisma } from "../database";

jest.mock("../database", () => ({
  prisma: {
    areaActuatorBinding: { findMany: jest.fn(), update: jest.fn() },
    actionLog: { create: jest.fn() },
  },
}));

describe("area actuator bindings", () => {
  test("exposes switch-like roles and maps an HA state to current state", () => {
    expect(ACTUATOR_ROLES).toEqual(["light", "humidifier", "dehumidifier", "ventilation", "fan"]);
    expect(buildActuatorState(
      { role: "humidifier", entityId: "switch.humidifier" },
      [{ entity_id: "switch.humidifier", state: "on", attributes: {} }],
    )).toEqual({ role: "humidifier", entityId: "switch.humidifier", state: "on" });
  });

  test("returns unknown when HA has no current state", () => {
    expect(buildActuatorState(
      { role: "fan", entityId: "switch.fan" },
      [],
    )).toEqual({ role: "fan", entityId: "switch.fan", state: "unknown" });
  });

  test("clears expired manual overrides lazily and logs them", async () => {
    const now = new Date("2026-10-17T20:00:00Z");
    (prisma.areaActuatorBinding.findMany as jest.Mock).mockResolvedValue([{ id: 7, role: "fan", entityId: "switch.fan" }]);
    await clearExpiredManual(1, now);
    expect(prisma.areaActuatorBinding.findMany).toHaveBeenCalledWith({
      where: { areaId: 1, manual: true, manualUntil: { lte: now } },
    });
    expect(prisma.areaActuatorBinding.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { manual: false, manualUntil: null } });
    expect(prisma.actionLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reason: "manual-expired" }) }));
  });
});
