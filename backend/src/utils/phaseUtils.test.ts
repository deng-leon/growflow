import { resolveAreaPhaseSettings } from './phaseUtils';

describe('resolveAreaPhaseSettings', () => {
  it('lets area settings override phase targets while preserving unset phase targets', () => {
    expect(resolveAreaPhaseSettings(
      {
        tempMin: 24,
        tempMax: 28,
        humidityMin: 55,
        humidityMax: 70,
        vpdMin: 0.8,
        vpdMax: 1.2,
        lightOnHours: 18,
      },
      {
        tempMin: 25,
        tempMax: null,
        humidityMin: null,
        humidityMax: 65,
        vpdMin: null,
        vpdMax: 1.1,
      },
    )).toEqual({
      tempMin: 25,
      tempMax: 28,
      humidityMin: 55,
      humidityMax: 65,
      vpdMin: 0.8,
      vpdMax: 1.1,
      lightOnHours: 18,
    });
  });
});
