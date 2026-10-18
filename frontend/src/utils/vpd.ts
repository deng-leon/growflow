/** Saturation vapour pressure in kPa (Tetens/Murray approximation). */
export const saturationVapourPressure = (temperatureC: number): number =>
  0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));

/** Relative humidity for a target VPD at a given air temperature. */
export const relativeHumidityForVPD = (
  temperatureC: number,
  vpd: number,
  leafOffsetC = -2,
): number => {
  const svpAir = saturationVapourPressure(temperatureC);
  const svpLeaf = saturationVapourPressure(temperatureC + leafOffsetC);
  return ((svpLeaf - vpd) / svpAir) * 100;
};

/** VPD in kPa. leafOffsetC is leaf temperature minus air temperature. */
export const calculateVPD = (
  temperatureC: number,
  humidityPercent: number,
  leafOffsetC = -2,
): number => {
  const vpd =
    saturationVapourPressure(temperatureC + leafOffsetC) -
    saturationVapourPressure(temperatureC) * (humidityPercent / 100);
  return Math.round(vpd * 100) / 100;
};

export type VpdZone = "under-transpiration" | "propagation" | "vegetative" | "flowering" | "danger";

export const classifyVPD = (vpd: number): VpdZone => {
  if (vpd < 0.4) return "under-transpiration";
  if (vpd < 0.8) return "propagation";
  if (vpd < 1.2) return "vegetative";
  if (vpd < 1.6) return "flowering";
  return "danger";
};

export const VPD_ZONE_COLORS: Record<VpdZone, string> = {
  "under-transpiration": "#4f81bd",
  propagation: "#78b159",
  vegetative: "#a8c957",
  flowering: "#f2c14e",
  danger: "#d95d39",
};
