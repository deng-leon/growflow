import {
  calculateEffectiveHumidityBand,
  saturationVaporPressure,
  calculateVpd,
} from './vpd';

describe('VPD', () => {
  test('calculates leaf-offset VPD in kPa', () => {
    expect(calculateVpd(25, 60, -2)).toBeCloseTo(0.91, 2);
  });

  test('uses the standard saturation vapor pressure formula', () => {
    expect(saturationVaporPressure(25)).toBeCloseTo(3.1678, 3);
  });

  test('converts a VPD corridor to the inverse RH corridor', () => {
    const band = calculateEffectiveHumidityBand(25, -2, 0.8, 1.2);
    expect(band?.min).toBeCloseTo(50.8, 0);
    expect(band?.max).toBeCloseTo(63.5, 0);
    expect(band?.unreachable).toBe(false);
  });

  test('uses the narrowest intersection with the explicit RH range', () => {
    const band = calculateEffectiveHumidityBand(25, -2, 0.8, 1.2, 55, 65);
    expect(band?.min).toBe(55);
    expect(band?.max).toBeCloseTo(63.5, 0);
    expect(band?.unreachable).toBe(false);
  });

  test('clamps unreachable corridors and reports them', () => {
    const band = calculateEffectiveHumidityBand(25, -2, 4, 5, 40, 60);
    expect(band?.unreachable).toBe(true);
    expect(band?.min).toBeGreaterThanOrEqual(0);
    expect(band?.max).toBeLessThanOrEqual(100);
  });

  test('returns no band when the VPD corridor is not configured', () => {
    expect(calculateEffectiveHumidityBand(25, -2, null, null)).toBeNull();
  });
});
