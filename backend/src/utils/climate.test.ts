import { extractClimateReadings } from "./climate";

describe("extractClimateReadings", () => {
  test("extracts current temperature and humidity attributes", () => {
    expect(extractClimateReadings({
      entity_id: "climate.room",
      state: "heat",
      attributes: { current_temperature: 22.5, current_humidity: 48 },
    })).toEqual({ temperature: 22.5, humidity: 48 });
  });

  test("leaves humidity null when the climate device does not expose it", () => {
    expect(extractClimateReadings({
      entity_id: "climate.room",
      state: "off",
      attributes: { current_temperature: "21.1" },
    })).toEqual({ temperature: 21.1, humidity: null });
  });

  test("treats unavailable climate state as unavailable", () => {
    expect(extractClimateReadings({
      entity_id: "climate.room",
      state: "unavailable",
      attributes: { current_temperature: 21, current_humidity: 50 },
    })).toEqual({ temperature: null, humidity: null });
  });
});
