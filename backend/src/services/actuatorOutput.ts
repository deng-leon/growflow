import { HAClient, haClient } from "./haClient";
import { CONFIG } from "../config/settings";

export interface ActuatorOutputBinding {
  role: string;
  entityId: string;
  speedEntityId?: string | null;
  maxSpeedPercent?: number | null;
}

export interface ActuatorOutput {
  on: boolean;
  speedPercent?: number;
}

type OutputClient = Pick<HAClient, "listEntities" | "callService">;

export const clampSpeedPercent = (speedPercent: number, maxSpeedPercent = 100): number =>
  speedPercent <= 0 ? 0 : Math.min(maxSpeedPercent, speedPercent);

export const scaleSpeedPercent = (demandPercent: number, maxSpeedPercent = 100): number =>
  demandPercent <= 0 ? 0 : Math.max(1, Math.round((Math.min(demandPercent, 100) * maxSpeedPercent) / 100));

export async function setActuatorOutput(
  binding: ActuatorOutputBinding,
  output: ActuatorOutput,
  client: OutputClient = haClient,
): Promise<void> {
  const states = await client.listEntities();
  const switchState = states.find((state) => state.entity_id === binding.entityId);
  const speedState = binding.speedEntityId
    ? states.find((state) => state.entity_id === binding.speedEntityId)
    : undefined;

  if (!output.on) {
    if (switchState?.state !== "off") {
      await client.callService("homeassistant", "turn_off", { entity_id: binding.entityId });
    }
    const features = Number(speedState?.attributes?.supported_features);
    const canTurnOff = !Number.isFinite(features) || (features & 32) !== 0;
    if (binding.speedEntityId && speedState?.state !== "off" && canTurnOff) {
      await client.callService("fan", "turn_off", { entity_id: binding.speedEntityId });
    }
    return;
  }

  if (switchState?.state !== "on") {
    await client.callService("homeassistant", "turn_on", { entity_id: binding.entityId });
  }
  if (binding.speedEntityId && output.speedPercent !== undefined && output.speedPercent > 0) {
    const speedPercent = clampSpeedPercent(output.speedPercent, binding.maxSpeedPercent ?? 100);
    const current = Number(speedState?.attributes?.percentage);
    if (speedState?.state !== "on" || !Number.isFinite(current) || current !== speedPercent) {
      await client.callService("fan", "set_percentage", {
        entity_id: binding.speedEntityId,
        percentage: speedPercent,
      });
    }
  }
}
