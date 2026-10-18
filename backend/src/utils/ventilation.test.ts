import { absoluteHumidity, ventilationDemand } from './ventilation';

describe('ventilation demand', () => {
  test('calculates absolute humidity in grams per cubic metre', () => {
    expect(absoluteHumidity(25, 50)).toBeCloseTo(11.51, 1);
  });

  test('uses a cooler room to ventilate a hot tent without staging humidification', () => {
    expect(ventilationDemand({
      tentTemperature: 30, tentHumidity: 55, temperatureMin: 22, temperatureMax: 28,
      humidityMin: 45, humidityMax: 65, roomTemperature: 20, roomHumidity: 50,
    })).toMatchObject({ canHelp: true, speedPercent: 50 });
  });

  test('rejects ventilation when room air cannot fix a humid tent', () => {
    expect(ventilationDemand({
      tentTemperature: 25, tentHumidity: 80, temperatureMin: 22, temperatureMax: 28,
      humidityMin: 45, humidityMax: 65, roomTemperature: 25, roomHumidity: 80,
    }).canHelp).toBe(false);
  });

  test('chooses the furthest helped variable in a conflict', () => {
    expect(ventilationDemand({
      tentTemperature: 30, tentHumidity: 80, temperatureMin: 22, temperatureMax: 28,
      humidityMin: 45, humidityMax: 65, roomTemperature: 20, roomHumidity: 40,
    }).reason).toContain('humidity');
  });
});
