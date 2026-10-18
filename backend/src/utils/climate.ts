import { HAState } from "../services/haClient";

export type ClimateReading = { temperature: number | null; humidity: number | null };

export const extractClimateReadings = (state: HAState | undefined): ClimateReading => {
  if (!state || state.state === "unavailable" || state.state === "unknown") {
    return { temperature: null, humidity: null };
  }
  const number = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    temperature: number(state.attributes?.current_temperature),
    humidity: number(state.attributes?.current_humidity),
  };
};
