import { useEffect } from "react";

import { useUi } from "@/state/ui";

import { buildCommands, isEnabled } from "./commands";
import { matchesShortcut } from "./shortcuts";

/** True while the focus is in a text field, where keys belong to the field. */
export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.closest?.(
      "input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable=true]",
    ),
  );
}

/**
 * Keyboard shortcuts for every command, plus the hold-to-see-original key.
 * While you type in a field, only the command palette shortcut works.
 */
export function useGlobalKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const typing = isTyping(event.target);
      // Hold "\" to see the original. Repeats arrive while held, and are harmless.
      if (
        event.code === "Backslash" &&
        !typing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        useUi.getState().setShowOriginal(true);
        return;
      }
      // Radix dialogs and menus handle their own keys.
      if (useUi.getState().dialog && !(event.key === "k" && (event.ctrlKey || event.metaKey)))
        return;
      const commands = buildCommands();
      for (const command of commands) {
        if (!command.shortcut || command.browserKey) continue;
        if (!matchesShortcut(event, command.shortcut)) continue;
        if (typing && command.id !== "help.palette") return;
        // Single keys such as H must not fire inside menus or other widgets that use letters.
        const single = !command.shortcut.includes("+");
        if (
          single &&
          (event.target as HTMLElement | null)?.closest?.("[role=menu], [role=listbox]")
        )
          return;
        event.preventDefault();
        if (event.repeat && single) return;
        if (isEnabled(command)) command.run();
        return;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Backslash") useUi.getState().setShowOriginal(false);
    };
    // Release the original view if the window loses focus while the key is held.
    const onBlur = () => useUi.getState().setShowOriginal(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
