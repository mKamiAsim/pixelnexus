import { clsx } from "clsx";
import { Check, ChevronRight } from "lucide-react";
import { Menubar } from "radix-ui";
import { Fragment, useEffect, useReducer } from "react";

import { buildCommands, isEnabled, MENUS, type Command, type MenuId } from "./commands";
import { onPanelsChange } from "./layout";
import { displayShortcut } from "./shortcuts";

const CONTENT =
  "z-50 min-w-56 rounded-control border border-border bg-overlay p-1 text-sm text-text shadow-popover";
const ITEM =
  "relative flex h-7 cursor-default items-center gap-2 rounded-[3px] pr-2 pl-7 outline-none select-none data-[disabled]:text-text-disabled data-[highlighted]:bg-accent data-[highlighted]:text-on-accent";

type Entry =
  { kind: "command"; command: Command } | { kind: "submenu"; title: string; commands: Command[] };

/** Commands in menu order. Commands that share a submenu title are grouped at the first one. */
function entriesFor(commands: readonly Command[], menu: MenuId): Entry[] {
  const entries: Entry[] = [];
  const submenus = new Map<string, Command[]>();
  for (const command of commands) {
    if (command.menu !== menu) continue;
    if (!command.submenu) {
      entries.push({ kind: "command", command });
      continue;
    }
    const existing = submenus.get(command.submenu);
    if (existing) existing.push(command);
    else {
      const list = [command];
      submenus.set(command.submenu, list);
      entries.push({ kind: "submenu", title: command.submenu, commands: list });
    }
  }
  return entries;
}

const sectionOf = (entry: Entry) =>
  entry.kind === "command" ? entry.command.section : entry.commands[0]?.section;

function CommandItem({ command }: { command: Command }) {
  const enabled = isEnabled(command);
  const shortcut = command.shortcut ? (
    <span className="ml-auto pl-6 text-xs opacity-70">{displayShortcut(command.shortcut)}</span>
  ) : null;
  if (command.checked) {
    return (
      <Menubar.CheckboxItem
        className={ITEM}
        checked={command.checked()}
        disabled={!enabled}
        onSelect={() => command.run()}
      >
        <Menubar.ItemIndicator className="absolute left-2">
          <Check size={13} />
        </Menubar.ItemIndicator>
        {command.label}
        {shortcut}
      </Menubar.CheckboxItem>
    );
  }
  return (
    <Menubar.Item className={ITEM} disabled={!enabled} onSelect={() => command.run()}>
      {command.label}
      {shortcut}
    </Menubar.Item>
  );
}

/** The main menu. Every item is a command, so menus, shortcuts and the palette agree. */
export function MenuBar() {
  // Panel check marks depend on dockview, not on React state, so re-render when panels change.
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onPanelsChange(refresh), []);
  const commands = buildCommands();

  return (
    <Menubar.Root aria-label="Main menu" className="flex items-center">
      {MENUS.map((menu) => {
        const entries = entriesFor(commands, menu.id);
        return (
          <Menubar.Menu key={menu.id}>
            <Menubar.Trigger className="h-6 rounded-control px-2 text-sm text-text-secondary outline-none select-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid hover:bg-hover hover:text-text data-[highlighted]:bg-hover data-[state=open]:bg-hover data-[state=open]:text-text">
              {menu.label}
            </Menubar.Trigger>
            <Menubar.Portal>
              <Menubar.Content align="start" sideOffset={4} className={CONTENT}>
                {entries.map((entry, index) => {
                  const previous = entries[index - 1];
                  const separator = previous && sectionOf(previous) !== sectionOf(entry);
                  return (
                    <Fragment key={entry.kind === "command" ? entry.command.id : entry.title}>
                      {separator ? (
                        <Menubar.Separator className="my-1 h-px bg-border-subtle" />
                      ) : null}
                      {entry.kind === "command" ? (
                        <CommandItem command={entry.command} />
                      ) : (
                        <Menubar.Sub>
                          <Menubar.SubTrigger className={clsx(ITEM, "data-[state=open]:bg-hover")}>
                            {entry.title}
                            <ChevronRight size={13} className="ml-auto" />
                          </Menubar.SubTrigger>
                          <Menubar.Portal>
                            <Menubar.SubContent sideOffset={2} alignOffset={-4} className={CONTENT}>
                              {entry.commands.map((command) => (
                                <CommandItem key={command.id} command={command} />
                              ))}
                            </Menubar.SubContent>
                          </Menubar.Portal>
                        </Menubar.Sub>
                      )}
                    </Fragment>
                  );
                })}
              </Menubar.Content>
            </Menubar.Portal>
          </Menubar.Menu>
        );
      })}
    </Menubar.Root>
  );
}
