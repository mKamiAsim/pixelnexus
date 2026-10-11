import { clsx } from "clsx";

/** A keyboard shortcut, for example "Ctrl+Z". Parts are split on "+". */
export function Kbd({ keys, className }: { keys: string; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-0.5", className)}>
      {keys.split("+").map((key) => (
        <kbd
          key={key}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border bg-raised px-1 font-mono text-2xs text-text-secondary"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
