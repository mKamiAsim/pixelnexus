import { Kbd } from "@/components/ui/Kbd";
import { Dialog } from "@/components/ui/Dialog";
import { useUi } from "@/state/ui";

import { buildCommands, MENUS } from "./commands";
import { displayShortcut, isApple } from "./shortcuts";

/** Viewport gestures that are not menu commands. */
const GESTURES: readonly { keys: string; action: string }[] = [
  { keys: "Space", action: "Hold and drag to pan, with any tool" },
  { keys: "\\", action: "Hold to see the original image" },
  { keys: "Arrow keys", action: "Pan the focused canvas. Add Shift for bigger steps." },
  {
    keys: `${isApple ? "Cmd" : "Ctrl"}+Wheel`,
    action: "Zoom at the pointer. Alt+Wheel works too.",
  },
  { keys: "Wheel", action: "Scroll the view. Add Shift to scroll sideways." },
  { keys: "Middle drag", action: "Pan" },
  { keys: "Pinch", action: "Zoom on a trackpad or touch screen" },
  { keys: "Double-click", action: "Hand tool: fit the image. Zoom tool: 100%." },
];

/** All keyboard shortcuts, read from the same command list as the menus. */
export function ShortcutSheet() {
  const open = useUi((s) => s.dialog === "shortcuts");
  const setDialog = useUi((s) => s.setDialog);
  const commands = buildCommands().filter((command) => command.shortcut);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "shortcuts" : null)}
      title="Keyboard shortcuts"
      description={`${isApple ? "Cmd" : "Ctrl"} shortcuts work anywhere except while you type in a field.`}
      className="w-[min(44rem,calc(100vw-2rem))]"
      scrollableText
    >
      <div className="grid gap-x-8 gap-y-5 p-4 sm:grid-cols-2">
        {MENUS.map((menu) => {
          const list = commands.filter((command) => command.menu === menu.id);
          if (list.length === 0) return null;
          return (
            <section
              key={menu.id}
              aria-labelledby={`keys-${menu.id}`}
              className="flex flex-col gap-1.5"
            >
              <h3 id={`keys-${menu.id}`} className="text-xs font-semibold text-text-secondary">
                {menu.label}
              </h3>
              <dl className="flex flex-col gap-1">
                {list.map((command) => (
                  <div key={command.id} className="flex items-center justify-between gap-3 text-sm">
                    <dt className={command.phase ? "text-text-muted" : undefined}>
                      {command.submenu ? `${command.submenu}: ${command.label}` : command.label}
                      {command.phase ? ` (from Phase ${command.phase})` : ""}
                    </dt>
                    <dd>
                      <Kbd keys={displayShortcut(command.shortcut ?? "")} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
        <section aria-labelledby="keys-canvas" className="flex flex-col gap-1.5 sm:col-span-2">
          <h3 id="keys-canvas" className="text-xs font-semibold text-text-secondary">
            Canvas
          </h3>
          <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {GESTURES.map((gesture) => (
              <div key={gesture.keys} className="flex items-center justify-between gap-3 text-sm">
                <dt className="text-text-secondary">{gesture.action}</dt>
                <dd className="shrink-0">
                  <Kbd keys={gesture.keys} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </Dialog>
  );
}
