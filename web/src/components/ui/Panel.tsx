import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";
import { Collapsible, Tabs } from "radix-ui";
import type { ReactNode } from "react";

/** A docked panel: a header strip with tabs or a title, actions on the right, and a scrolling body. */
export function PanelFrame({
  header,
  actions,
  children,
  className,
}: {
  header: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("flex min-h-0 flex-col bg-panel", className)}>
      <div className="flex h-7 shrink-0 items-stretch justify-between border-b border-border-subtle bg-panel-header">
        <div className="flex min-w-0 items-stretch">{header}</div>
        {actions ? <div className="flex items-center gap-0.5 pr-1">{actions}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center px-3 text-xs font-medium text-text-secondary">{children}</h2>
  );
}

/** Tabs that live in a panel header, like a group of docked panels in Photoshop. */
export function PanelTabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Tabs.Root value={value} onValueChange={onChange} className="flex items-stretch">
      <Tabs.List aria-label={label} className="flex items-stretch">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.value}
            value={tab.value}
            className={clsx(
              "relative border-r border-border-subtle px-3 text-xs font-medium text-text-muted hover:text-text-secondary",
              "data-[state=active]:bg-panel data-[state=active]:text-text",
              "data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-px data-[state=active]:after:bg-panel",
            )}
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

/** A collapsible group of controls inside a panel. */
export function PanelSection({
  title,
  defaultOpen = true,
  aside,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="border-b border-border-subtle">
      <div className="flex h-7 items-center justify-between pr-2">
        <Collapsible.Trigger className="group flex h-full flex-1 items-center gap-1 pl-2 text-left text-xs font-medium text-text-secondary hover:text-text">
          <ChevronRight
            size={12}
            className="text-text-muted transition-transform group-data-[state=open]:rotate-90"
          />
          {title}
        </Collapsible.Trigger>
        {aside}
      </div>
      <Collapsible.Content className="flex flex-col gap-3 px-3 pt-1 pb-3">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
