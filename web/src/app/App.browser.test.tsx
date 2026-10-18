import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "@/app/App";
import { useDocuments } from "@/state/documents";
import { useUi } from "@/state/ui";
import "@/styles/index.css";

afterEach(() => {
  cleanup();
  // The stores are module singletons. Reset them so each test starts clean.
  useUi.setState({ dialog: null });
  useDocuments.setState({ documents: [], activeId: null });
});

describe("App shell", () => {
  it("shows the menus, the empty canvas and the privacy note", () => {
    render(<App />);
    const menu = screen.getByRole("menubar", { name: "Main menu" });
    for (const name of ["File", "Edit", "Image", "Select", "Filter", "View", "Window", "Help"]) {
      expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Open an image to start" })).toBeInTheDocument();
    expect(
      screen.getAllByText("Images are processed locally in your browser.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "Tools" })).toBeInTheDocument();
  });

  it("opens the command palette with Ctrl+K and filters commands", () => {
    render(<App />);
    act(() => {
      fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    });
    const search = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(search, { target: { value: "rotate 180" } });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Rotate 180 degrees");
  });

  it("opens a test image from the empty state", async () => {
    render(<App />);
    // Dockview renders panel contents after it has measured the workspace.
    fireEvent.click(await screen.findByRole("button", { name: /Checkerboard/ }));
    const strip = await screen.findByRole("list", { name: "Document tabs" });
    expect(within(strip).getByRole("button", { name: /^Checkerboard\.png/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
