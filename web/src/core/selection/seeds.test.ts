import { describe, expect, it } from "vitest";

import { SEED_BACKGROUND, SEED_OBJECT, SEED_UNKNOWN, seedMap } from "./seeds";

describe("seedMap", () => {
  it("marks the image edge as background until there is a background seed", () => {
    const map = seedMap(5, 4, [{ x: 2.7, y: 1.2, object: true }], 0);
    const rows = Array.from({ length: 4 }, (_, y) => [...map.data.slice(y * 5, y * 5 + 5)]);
    expect(rows).toEqual([
      [0, 0, 0, 0, 0],
      [0, SEED_UNKNOWN, SEED_OBJECT, SEED_UNKNOWN, 0],
      [0, SEED_UNKNOWN, SEED_UNKNOWN, SEED_UNKNOWN, 0],
      [0, 0, 0, 0, 0],
    ]);
  });

  it("drops the edge once a background seed exists, and paints disks", () => {
    const map = seedMap(
      9,
      9,
      [
        { x: 4, y: 4, object: true },
        { x: 0, y: 0, object: false },
      ],
      1,
    );
    expect(map.data[0]).toBe(SEED_BACKGROUND);
    expect(map.data[8]).toBe(SEED_UNKNOWN);
    const object = [...map.data].filter((v) => v === SEED_OBJECT).length;
    expect(object).toBe(5);
    expect(map.data[9 * 3 + 3]).toBe(SEED_UNKNOWN);
  });

  it("lets later seeds paint over earlier ones", () => {
    const map = seedMap(
      3,
      3,
      [
        { x: 1, y: 1, object: true },
        { x: 1, y: 1, object: false },
      ],
      0,
    );
    expect(map.data[4]).toBe(SEED_BACKGROUND);
  });
});
