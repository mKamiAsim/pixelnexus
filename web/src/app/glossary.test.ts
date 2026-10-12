import { describe, expect, it } from "vitest";

import { glossarySegments } from "./glossary";

const terms = (text: string) =>
  glossarySegments(text)
    .filter((s) => s.entry)
    .map((s) => [s.text, s.entry?.term]);

describe("glossary terms in text", () => {
  it("finds terms and aliases, ignoring case", () => {
    expect(terms("The kernel uses the border mode.")).toEqual([
      ["kernel", "Kernel"],
      ["border mode", "Border mode"],
    ]);
    expect(terms("A PSF describes the blur.")).toEqual([["PSF", "Point spread function"]]);
  });

  it("marks each term once", () => {
    expect(terms("Kernel after kernel after kernel.")).toHaveLength(1);
  });

  it("prefers the longest name and needs whole words", () => {
    expect(terms("Its support radius is 3.")).toEqual([["support radius", "Support radius"]]);
    expect(terms("Kernels and akernel")).toEqual([]);
  });

  it("keeps all the text", () => {
    const text = "Correlation applies the kernel without flipping it.";
    expect(
      glossarySegments(text)
        .map((s) => s.text)
        .join(""),
    ).toBe(text);
  });
});
