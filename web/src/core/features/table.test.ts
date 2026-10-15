import { describe, expect, it } from "vitest";

import { createMask } from "@/core/mask/mask";

import { featurePoints, isFeatureTable, rowsInMask, tableToCsv, type FeatureTable } from "./table";

const table: FeatureTable = {
  kind: "features",
  columns: [
    { key: "x", label: "x", unit: "px" },
    { key: "y", label: "y", unit: "px" },
    { key: "radius", label: "Radius", unit: "px" },
    { key: "score", label: "Score", unit: "" },
  ],
  rows: [
    [3, 1, 2.5, 0.9],
    [0, 4, 1.4142, 0.25],
    [7, 7, 4, 0.1],
  ],
  summary: "3 blobs",
};

describe("feature tables", () => {
  it("recognizes a table in JSON", () => {
    expect(isFeatureTable(table)).toBe(true);
    expect(isFeatureTable({ kind: "stages", stages: [] })).toBe(false);
    expect(isFeatureTable(null)).toBe(false);
  });

  it("puts points at pixel centers, with their radius", () => {
    expect(featurePoints(table)[0]).toEqual({ x: 3.5, y: 1.5, radius: 2.5, angle: null });
    const angled = {
      ...table,
      columns: [...table.columns, { key: "angle", label: "Angle", unit: "deg" }],
      rows: [[1, 2, 3, 0.5, 90]],
    };
    expect(featurePoints(angled)[0]?.angle).toBe(90);
    expect(featurePoints({ ...table, columns: table.columns.slice(2) })).toEqual([]);
  });

  it("keeps the rows on selected pixels and counts them again", () => {
    const mask = createMask(8, 8);
    mask.data[1 * 8 + 3] = 255;
    mask.data[7 * 8 + 7] = 1;
    const kept = rowsInMask(table, mask);
    expect(kept.rows).toEqual([table.rows[0], table.rows[2]]);
    expect(kept.summary).toBe("2 blobs");
    expect(rowsInMask(table, createMask(8, 8)).summary).toBe("0 blobs");
    const one = createMask(8, 8);
    one.data[4 * 8] = 255;
    expect(rowsInMask(table, one).summary).toBe("1 blob");
    expect(rowsInMask(table, null)).toBe(table);
  });

  it("writes CSV with units in the header", () => {
    expect(tableToCsv(table).split("\n").slice(0, 2)).toEqual([
      "x (px),y (px),Radius (px),Score",
      "3,1,2.5,0.9",
    ]);
    const odd = { ...table, columns: [{ key: "x", label: 'Say "hi", x', unit: "" }], rows: [] };
    expect(tableToCsv(odd)).toBe('"Say ""hi"", x"\n');
  });
});
