import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { catalogPlugin } from "./build/catalog-plugin.ts";

export default defineConfig({
  // Relative asset paths, so the same build works at "/", at "/studio/" and inside a native WebView.
  base: "./",
  plugins: [react(), tailwindcss(), catalogPlugin()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  worker: { format: "es" },
  // Pre-bundle CommonJS packages up front, so tests do not reload when Vite finds them.
  optimizeDeps: {
    include: [
      "utif2",
      "clsx",
      "dockview-react",
      "lucide-react",
      "radix-ui",
      "zustand",
      "@testing-library/react",
    ],
  },
  build: {
    rollupOptions: {
      // The style tile is a living reference for the design system.
      input: { main: "index.html", styleTile: "style-tile.html" },
    },
  },
  // Read .env files from the repository root, next to .env.example.
  envDir: "..",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    setupFiles: ["./tests/setup.ts"],
    // The numeric tests run several times slower under coverage on the CI runners.
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.browser.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        // Tests that need real browser APIs: workers, createImageBitmap, OffscreenCanvas, WebGL2.
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**", "src/**/*.test.{ts,tsx}", "src/main.tsx", "src/style-tile/**"],
    },
  },
});
