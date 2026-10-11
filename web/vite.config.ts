import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
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
  // Read .env files from the repository root, next to .env.example.
  envDir: "..",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**", "src/**/*.test.{ts,tsx}", "src/main.tsx"],
    },
  },
});
