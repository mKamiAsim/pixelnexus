import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@/styles/index.css";
import { storedTheme } from "@/styles/themes";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { TooltipProvider } from "@/components/ui/Tooltip";

import { StyleTile } from "./StyleTile";

document.documentElement.dataset.theme = storedTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <StyleTile />
    </TooltipProvider>
  </StrictMode>,
);
