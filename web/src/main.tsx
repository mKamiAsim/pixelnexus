import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";

import { App } from "@/app/App";
import { registerServiceWorker } from "@/app/serviceWorker";
import "@/styles/index.css";
import { storedTheme } from "@/styles/themes";

document.documentElement.dataset.theme = storedTheme();
registerServiceWorker();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
