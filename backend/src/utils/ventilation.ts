export interface VentilationDemandInput {
  tentTemperature: number;
  tentHumidity: number;
  temperatureMin?: number | null;
  temperatureMax?: number | null;
  humidityMin?: number | null;
  humidityMax?: number | null;
  roomTemperature?: number | null;
  roomHumidity?: number | null;
  minSpeedPercent?: number;
}

export interface VentilationDemand {
  speedPercent: number;
  canHelp: boolean;
  reason: string;
}

export const absoluteHumidity = (temperatureC: number, relativeHumidity: number): number => {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(relativeHumidity)) return NaN;
  const rh = Math.max(0, Math.min(100, relativeHumidity));
  const saturation = 6.112 * Math.exp((17.67 * temperatureC) / (temperatureC + 243.5));
  return (saturation * rh * 2.1674) / (273.15 + temperatureC);
};

const normalizedOutside = (value: number, min?: number | null, max?: number | null): number => {
  if (!Number.isFinite(value) || min == null || max == null || min > max) return 0;
  const span = Math.max(max - min, 0.01);
  return value < min ? (min - value) / span : value > max ? (value - max) / span : 0;
};

export const ventilationDemand = ({
  tentTemperature,
  tentHumidity,
  temperatureMin,
  temperatureMax,
  humidityMin,
  humidityMax,
  roomTemperature,
  roomHumidity,
  minSpeedPercent = 25,
}: VentilationDemandInput): VentilationDemand => {
  const tempOutside = normalizedOutside(tentTemperature, temperatureMin, temperatureMax);
  const humidityOutside = normalizedOutside(tentHumidity, humidityMin, humidityMax);
  const hasRoom = Number.isFinite(roomTemperature) && Number.isFinite(roomHumidity);
  if (!tempOutside && !humidityOutside) {
    return { speedPercent: 0, canHelp: true, reason: 'within target band' };
  }
  if (!hasRoom) {
    const deviation = Math.max(tempOutside, humidityOutside);
    return {
      speedPercent: Math.min(100, Math.max(minSpeedPercent, minSpeedPercent + deviation * (100 - minSpeedPercent))),
      canHelp: true,
      reason: `ventilation demand ${Math.round(deviation * 100)}% without room sensors`,
    };
  }

  const roomAh = absoluteHumidity(roomTemperature as number, roomHumidity as number);
  const tentAh = absoluteHumidity(tentTemperature, tentHumidity);
  const tempNeedsHelp = tempOutside > 0
    && (tentTemperature > (temperatureMax ?? tentTemperature)
      ? (roomTemperature as number) < tentTemperature
      : (roomTemperature as number) > tentTemperature);
  const humidityNeedsHelp = humidityOutside > 0
    && (tentHumidity > (humidityMax ?? tentHumidity) ? roomAh < tentAh : roomAh > tentAh);
  const tempBlocked = tempOutside === 0 && temperatureMin != null && temperatureMax != null
    && ((roomTemperature as number) < temperatureMin || (roomTemperature as number) > temperatureMax);
  const humidityBlocked = humidityOutside === 0 && humidityMin != null && humidityMax != null
    && ((roomAh < absoluteHumidity(tentTemperature, humidityMin))
      || (roomAh > absoluteHumidity(tentTemperature, humidityMax)));
  const candidates = [
    ...(tempNeedsHelp && !tempBlocked ? [{ deviation: tempOutside, label: 'temperature' }] : []),
    ...(humidityNeedsHelp && !humidityBlocked ? [{ deviation: humidityOutside, label: 'humidity' }] : []),
  ];
  if (!candidates.length) {
    return {
      speedPercent: 0,
      canHelp: false,
      reason: 'ventilation cannot improve the out-of-band variable without worsening another limit',
    };
  }
  candidates.sort((a, b) => b.deviation - a.deviation);
  const winner = candidates[0];
  const speed = Math.min(100, Math.max(minSpeedPercent, minSpeedPercent
    + winner.deviation * (100 - minSpeedPercent)));
  return {
    speedPercent: Math.round(speed),
    canHelp: true,
    reason: `ventilation helps ${winner.label}; normalized deviation ${(winner.deviation * 100).toFixed(1)}%`,
  };
};
