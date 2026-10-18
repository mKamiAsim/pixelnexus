import { describe, expect, it } from "vitest";

import {
  adaptationMatrix,
  ILLUMINANTS,
  lightWhite,
  planckianXy,
  rgbAdaptation,
  type Vec3,
} from "./adaptation";

const xyOf = (w: Vec3) => [w[0] / (w[0] + w[1] + w[2]), w[1] / (w[0] + w[1] + w[2])];

describe("chromatic adaptation", () => {
  it("matches Lindbloom's Bradford matrix from A to D65", () => {
    const m = adaptationMatrix(ILLUMINANTS.A, ILLUMINANTS.D65, "bradford");
    const lindbloom = [
      [0.8446965, -0.1179225, 0.3948108],
      [-0.1366303, 1.1041226, 0.1291718],
      [0.0798489, -0.1348999, 3.1924009],
    ];
    m.forEach((row, i) =>
      row.forEach((v, j) => expect(v).toBeCloseTo(lindbloom[i]?.[j] ?? NaN, 6)),
    );
  });

  it("maps the source white onto the target white", () => {
    for (const method of ["bradford", "von-kries", "xyz-scaling"] as const) {
      const m = adaptationMatrix(ILLUMINANTS.F11, ILLUMINANTS.D50, method);
      const w = ILLUMINANTS.F11;
      const out = m.map((row) => row[0] * w[0] + row[1] * w[1] + row[2] * w[2]);
      out.forEach((v, i) => expect(v).toBeCloseTo(ILLUMINANTS.D50[i] ?? NaN, 10));
    }
  });

  it("changes nothing when source and target are the same", () => {
    const m = rgbAdaptation(ILLUMINANTS.D65, ILLUMINANTS.D65, "bradford");
    m.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(i === j ? 1 : 0, 12)));
  });
});

describe("light sources", () => {
  it("puts 2856 K near illuminant A, a Planckian light at that temperature", () => {
    const [x, y] = planckianXy(2856);
    const [ax, ay] = xyOf(ILLUMINANTS.A);
    expect(Math.abs(x - (ax ?? 0))).toBeLessThan(1e-3);
    expect(Math.abs(y - (ay ?? 0))).toBeLessThan(1e-3);
  });

  it("moves the white toward green for a positive Duv", () => {
    const uv = (w: Vec3) => {
      const d = w[0] + 15 * w[1] + 3 * w[2];
      return [(4 * w[0]) / d, (6 * w[1]) / d] as const;
    };
    const base = uv(lightWhite(5000, 0));
    const green = uv(lightWhite(5000, 0.01));
    expect(Math.hypot(green[0] - base[0], green[1] - base[1])).toBeCloseTo(0.01, 6);
    expect(green[1]).toBeGreaterThan(base[1]);
  });
});
