export const saturationVaporPressure = (temperatureC: number): number =>
  0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));

export const calculateVpd = (
  temperatureC: number,
  relativeHumidity: number,
  leafOffsetC = -2,
): number => {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(relativeHumidity)) return NaN;
  const leafVaporPressure = saturationVaporPressure(temperatureC + leafOffsetC);
  const airVaporPressure = (Math.max(0, Math.min(100, relativeHumidity)) / 100)
    * saturationVaporPressure(temperatureC);
  return Math.max(0, leafVaporPressure - airVaporPressure);
};

export interface EffectiveHumidityBand {
  min: number;
  max: number;
  unreachable: boolean;
}

export const calculateEffectiveHumidityBand = (
  temperatureC: number,
  leafOffsetC: number,
  vpdMin: number | null | undefined,
  vpdMax: number | null | undefined,
  rhMin?: number | null,
  rhMax?: number | null,
): EffectiveHumidityBand | null => {
  if (
    !Number.isFinite(temperatureC)
    || !Number.isFinite(leafOffsetC)
    || !Number.isFinite(vpdMin)
    || !Number.isFinite(vpdMax)
    || (vpdMin as number) > (vpdMax as number)
  ) return null;

  const airVaporPressure = saturationVaporPressure(temperatureC);
  const leafVaporPressure = saturationVaporPressure(temperatureC + leafOffsetC);
  const humidityForVpd = (vpd: number) =>
    ((leafVaporPressure - vpd) / airVaporPressure) * 100;
  const vpdMinRh = humidityForVpd(vpdMin as number);
  const vpdMaxRh = humidityForVpd(vpdMax as number);
  const vpdBand = {
    min: Math.min(vpdMinRh, vpdMaxRh),
    max: Math.max(vpdMinRh, vpdMaxRh),
  };
  const requestedMin = rhMin == null ? 0 : Math.max(0, Math.min(100, rhMin));
  const requestedMax = rhMax == null ? 100 : Math.max(0, Math.min(100, rhMax));
  const min = Math.max(0, requestedMin, vpdBand.min);
  const max = Math.min(100, requestedMax, vpdBand.max);
  const unreachable = min > max;

  return {
    min: unreachable ? Math.max(0, Math.min(100, vpdBand.min)) : min,
    max: unreachable ? Math.max(0, Math.min(100, vpdBand.max)) : max,
    unreachable,
  };
};

export const effectiveHumidityBand = calculateEffectiveHumidityBand;
export const calculateEffectiveRhBand = calculateEffectiveHumidityBand;
