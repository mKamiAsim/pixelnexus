import { describe, expect, it } from "vitest";

import type { Param } from "@/generated/catalog-types";

import { sweepable, sweepValues } from "./sweep";

const param = (extra: Partial<Param>): Param => ({
  key: "p",
  label: "P",
  type: "number",
  default: 1,
  description: "A test parameter.",
  ...extra,
});

describe("parameter sweeps", () => {
  it("spaces numbers evenly, both ends included, on the parameter's step", () => {
    expect(sweepValues(param({ min: 0.1, max: 20, step: 0.1 }), 1, 5, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(sweepValues(param({ min: 0, step: 0.5 }), 0, 1, 4)).toEqual([0, 0.5, 1]);
  });

  it("keeps integers whole and odd where needed, inside the range, without repeats", () => {
    expect(sweepValues(param({ type: "integer", min: 3, max: 9, oddOnly: true }), 3, 9, 4)).toEqual(
      [3, 5, 7, 9],
    );
    expect(sweepValues(param({ type: "integer", min: 1, max: 4 }), 0, 10, 5)).toEqual([1, 3, 4]);
  });

  it("tries every option of a choice and both states of a switch", () => {
    const choice = param({
      type: "select",
      default: "a",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(sweepValues(choice)).toEqual(["a", "b"]);
    expect(sweepValues(param({ type: "boolean", default: false }))).toEqual([false, true]);
    expect(sweepable(param({ type: "kernel", default: "" }))).toBe(false);
  });

  it("limits the count to 2 to 12 cells", () => {
    expect(sweepValues(param({}), 0, 1, 1)).toHaveLength(2);
    expect(sweepValues(param({}), 0, 100, 50)).toHaveLength(12);
  });
});
