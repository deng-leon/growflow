import { clampSpeedPercent, scaleSpeedPercent, setActuatorOutput } from "./actuatorOutput";

describe("clampSpeedPercent", () => {
  test.each([
    [120, 100, 100],
    [80, 60, 60],
    [0, 60, 0],
    [30, 60, 30],
  ])("caps %s at max %s", (speed, max, expected) => {
    expect(clampSpeedPercent(speed, max)).toBe(expected);
  });
});

describe("scaleSpeedPercent", () => {
  test.each([
    [40, 25, 10],
    [100, 25, 25],
    [50, 100, 50],
    [1, 25, 1],
    [0, 25, 0],
  ])("demand %s with max %s -> %s", (demand, max, expected) => {
    expect(scaleSpeedPercent(demand, max)).toBe(expected);
  });
});

describe("setActuatorOutput", () => {
  test("turns on a ventilation switch and sets fan speed", async () => {
    const callService = jest.fn().mockResolvedValue(undefined);
    const client = { listEntities: jest.fn().mockResolvedValue([
      { entity_id: "switch.vent", state: "off", attributes: {} },
      { entity_id: "fan.vent_speed", state: "off", attributes: { percentage: 0 } },
    ]), callService };

    await setActuatorOutput(
      { role: "ventilation", entityId: "switch.vent", speedEntityId: "fan.vent_speed" },
      { on: true, speedPercent: 45 },
      client,
    );

    expect(callService.mock.calls).toEqual([
      ["homeassistant", "turn_on", { entity_id: "switch.vent" }],
      ["fan", "set_percentage", { entity_id: "fan.vent_speed", percentage: 45 }],
    ]);
  });

  test("skips services when the switch and speed are already at target", async () => {
    const callService = jest.fn().mockResolvedValue(undefined);
    const client = {
      listEntities: jest.fn().mockResolvedValue([
        { entity_id: "switch.vent", state: "on", attributes: {} },
        { entity_id: "fan.vent_speed", state: "on", attributes: { percentage: 45 } },
      ]),
      callService,
    };

    await setActuatorOutput(
      { role: "ventilation", entityId: "switch.vent", speedEntityId: "fan.vent_speed" },
      { on: true, speedPercent: 45 },
      client,
    );

    expect(callService).not.toHaveBeenCalled();
  });

  test("turns both entities off, including a fan that is still on", async () => {
    const callService = jest.fn().mockResolvedValue(undefined);
    const client = {
      listEntities: jest.fn().mockResolvedValue([
        { entity_id: "switch.vent", state: "off", attributes: {} },
        { entity_id: "fan.vent_speed", state: "on", attributes: { percentage: 20 } },
      ]),
      callService,
    };

    await setActuatorOutput(
      { role: "ventilation", entityId: "switch.vent", speedEntityId: "fan.vent_speed" },
      { on: false },
      client,
    );

    expect(callService).toHaveBeenCalledWith("fan", "turn_off", { entity_id: "fan.vent_speed" });
  });

  test("does not call fan.turn_off when the speed entity only supports speed", async () => {
    const callService = jest.fn();
    const client = {
      listEntities: jest.fn().mockResolvedValue([
        { entity_id: "switch.vent", state: "on", attributes: {} },
        { entity_id: "fan.vent_speed", state: "on", attributes: { percentage: 25, supported_features: 1 } },
      ]),
      callService,
    };
    await setActuatorOutput({ role: "ventilation", entityId: "switch.vent", speedEntityId: "fan.vent_speed" }, { on: false }, client as any);
    expect(callService).toHaveBeenCalledTimes(1);
    expect(callService).toHaveBeenCalledWith("homeassistant", "turn_off", { entity_id: "switch.vent" });
  });
});
