// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "@/app/App";

describe("App", () => {
  it("shows the catalog summary and the privacy note", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "PixelNexus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Catalog: 338 entries" })).toBeInTheDocument();
    expect(screen.getByText("Planned but not implemented")).toBeInTheDocument();
    expect(screen.getByText("Images are processed locally in your browser.")).toBeInTheDocument();
  });
});
