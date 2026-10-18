import { describe, expect, it } from "vitest";
import {
  calculateVPD,
  classifyVPD,
  relativeHumidityForVPD,
  saturationVapourPressure,
} from "./vpd";

describe("VPD utilities", () => {
  it("calculates saturation vapour pressure", () => {
    expect(saturationVapourPressure(25)).toBeCloseTo(3.168, 3);
  });

  it("calculates VPD using a negative leaf temperature offset", () => {
    expect(calculateVPD(25, 60, -2)).toBeCloseTo(0.91, 2);
    expect(calculateVPD(25, 60)).toBeCloseTo(0.91, 2);
  });

  it("classifies all zone boundaries", () => {
    expect(classifyVPD(0.39)).toBe("under-transpiration");
    expect(classifyVPD(0.4)).toBe("propagation");
    expect(classifyVPD(0.8)).toBe("vegetative");
    expect(classifyVPD(1.2)).toBe("flowering");
    expect(classifyVPD(1.6)).toBe("danger");
  });

  it("inverts VPD to relative humidity", () => {
    const humidity = relativeHumidityForVPD(25, 0.91, -2);
    expect(humidity).toBeCloseTo(60, 0);
    expect(relativeHumidityForVPD(25, 0, -2)).toBeCloseTo(100 * saturationVapourPressure(23) / saturationVapourPressure(25), 8);
  });
});
