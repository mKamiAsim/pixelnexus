/**
 * Registers the service worker (build/sw.js), so the studio opens offline and can be installed
 * as an app. Only production builds have one. When a new version is stored, the studio says so.
 * It starts the next time every studio tab is closed and opened again.
 */
import { notify } from "@/state/notifications";

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const next = registration.installing;
          next?.addEventListener("statechange", () => {
            // With no controller, this is the first install, not an update.
            if (next.state === "installed" && navigator.serviceWorker.controller)
              notify(
                "info",
                "A new version of the studio is ready",
                "Close every studio tab and open it again to use it.",
              );
          });
        });
      })
      .catch(() => {
        // Without a service worker the studio still works. It only needs the network to open.
      });
  });
}
