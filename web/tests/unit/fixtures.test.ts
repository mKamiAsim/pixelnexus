import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface FixtureImage {
  width: number;
  height: number;
  channels: number;
  dtype: string;
  data: number[];
}

const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/synthetic.json", import.meta.url), "utf8"),
) as { images: Record<string, FixtureImage> };

describe("synthetic fixtures from tools/make_fixtures.py", () => {
  it.each(Object.entries(fixtures.images))("%s has consistent size and range", (_name, image) => {
    expect(image.dtype).toBe("uint8");
    expect(image.data).toHaveLength(image.width * image.height * image.channels);
    expect(image.data.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
