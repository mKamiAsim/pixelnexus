import { clsx } from "clsx";
import { Check, Search } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Kbd";
import { useUi } from "@/state/ui";

import { buildCommands, isEnabled, MENUS, type Command } from "./commands";
import { searchCommands } from "./palette";
import { displayShortcut } from "./shortcuts";

function pathOf(command: Command): string {
  const menu = MENUS.find((m) => m.id === command.menu)?.label ?? command.menu;
  return command.submenu ? `${menu} > ${command.submenu}` : menu;
}

/** Find and run any command by typing part of its name. */
export function CommandPalette() {
  const open = useUi((s) => s.dialog === "palette");
  const setDialog = useUi((s) => s.setDialog);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "palette" : null)}
      title="Command palette"
      hideHeader
      className="top-[10vh]"
    >
      {open ? <PaletteBody onDone={() => setDialog(null)} /> : null}
    </Dialog>
  );
}

function PaletteBody({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const commands = useMemo(() => buildCommands(), []);
  const results = useMemo(() => searchCommands(commands, query).slice(0, 50), [commands, query]);
  const active = Math.min(cursor, Math.max(0, results.length - 1));

  const run = (command: Command | undefined) => {
    if (!command || !isEnabled(command)) return;
    onDone();
    // Run after the dialog closes, so commands that open another dialog are not closed with it.
    window.setTimeout(() => command.run(), 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((active + 1) % Math.max(1, results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((active - 1 + results.length) % Math.max(1, results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[active]);
    }
  };

  return (
    <div className="flex max-h-[70vh] flex-col">
      <label className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <Search size={15} className="text-text-muted" aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          aria-label="Search commands"
          placeholder="Type a command, for example zoom, export or theme"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          className="h-full w-full bg-transparent text-base text-text outline-none placeholder:text-text-muted"
        />
      </label>
      <ul
        id={listId}
        role="listbox"
        aria-label="Commands"
        className="min-h-0 flex-1 overflow-auto p-1"
      >
        {results.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-text-secondary">No command matches.</li>
        ) : (
          results.map((command, index) => {
            const enabled = isEnabled(command);
            const checked = command.checked?.();
            return (
              <li
                key={command.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={!enabled}
                onPointerMove={() => setCursor(index)}
                onClick={() => run(command)}
                className={clsx(
                  "flex h-8 cursor-default items-center gap-2 rounded-[3px] px-2 text-sm",
                  index === active && "bg-accent-subtle",
                  !enabled && "text-text-disabled",
                )}
              >
                <span className="flex w-4 justify-center text-accent-fg">
                  {checked ? <Check size={13} aria-label="On" /> : null}
                </span>
                <span className="truncate">{command.label}</span>
                <span className="truncate text-xs text-text-muted">{pathOf(command)}</span>
                {command.shortcut ? (
                  <Kbd keys={displayShortcut(command.shortcut)} className="ml-auto pl-2" />
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
