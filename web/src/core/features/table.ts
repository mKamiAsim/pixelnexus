/**
 * Feature tables: what feature detectors in the science engine return instead of an image.
 *
 * A table has columns with a key, a label and a unit, and one row of numbers per feature. Rows
 * with the keys x and y are points: x is the column and y the row of a pixel, so the point sits
 * at the pixel center (x + 0.5, y + 0.5) in image coordinates. An optional radius in pixels and
 * an angle in degrees, counterclockwise from the x axis, give its size and orientation.
 */
import type { Mask } from "@/core/mask/mask";

export interface FeatureColumn {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
}

export interface FeatureTable {
  readonly kind: "features";
  readonly columns: readonly FeatureColumn[];
  readonly rows: readonly (readonly number[])[];
  /** A short count for the user, such as "12 blobs". */
  readonly summary: string;
}

export interface FeaturePoint {
  /** The pixel center in image coordinates. */
  readonly x: number;
  readonly y: number;
  readonly radius: number | null;
  /** Degrees, counterclockwise from the x axis. */
  readonly angle: number | null;
}

/** True for a JSON value that has the shape of a feature table. */
export function isFeatureTable(value: unknown): value is FeatureTable {
  const table = value as Partial<FeatureTable> | null;
  return (
    typeof table === "object" &&
    table !== null &&
    table.kind === "features" &&
    Array.isArray(table.columns) &&
    Array.isArray(table.rows)
  );
}

const column = (table: FeatureTable, key: string) => table.columns.findIndex((c) => c.key === key);

/** The rows as points, or an empty list when the table has no x and y columns. */
export function featurePoints(table: FeatureTable): FeaturePoint[] {
  const [x, y, radius, angle] = ["x", "y", "radius", "angle"].map((key) => column(table, key));
  if (x === undefined || y === undefined || x < 0 || y < 0) return [];
  return table.rows.map((row) => ({
    x: (row[x] ?? 0) + 0.5,
    y: (row[y] ?? 0) + 0.5,
    radius: radius !== undefined && radius >= 0 ? (row[radius] ?? null) : null,
    angle: angle !== undefined && angle >= 0 ? (row[angle] ?? null) : null,
  }));
}

/**
 * Keep the rows whose point lies on a selected pixel of the mask. Tables without points, and
 * all tables when there is no mask, stay as they are.
 */
export function rowsInMask(table: FeatureTable, mask: Mask | null): FeatureTable {
  const x = column(table, "x");
  const y = column(table, "y");
  if (!mask || x < 0 || y < 0) return table;
  const rows = table.rows.filter((row) => {
    const px = Math.floor(row[x] ?? -1);
    const py = Math.floor(row[y] ?? -1);
    const inside = px >= 0 && py >= 0 && px < mask.width && py < mask.height;
    return inside && (mask.data[py * mask.width + px] ?? 0) > 0;
  });
  // "12 blobs" names the features. Count again with the same noun.
  const noun = table.summary.replace(/^\d+\s+/, "").replace(/s$/, "");
  return { ...table, rows, summary: `${rows.length} ${rows.length === 1 ? noun : `${noun}s`}` };
}

/** A CSV file with a header row of labels and units, and the rows as they are. */
export function tableToCsv(table: FeatureTable): string {
  const quote = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const header = table.columns.map((c) => quote(c.unit ? `${c.label} (${c.unit})` : c.label));
  const lines = [header.join(","), ...table.rows.map((row) => row.map(String).join(","))];
  return `${lines.join("\n")}\n`;
}
