import { clsx } from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { Select as RadixSelect } from "radix-ui";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  label: string;
  size?: "sm" | "md" | "touch";
  className?: string;
}

const SIZES = { sm: "h-6 text-xs", md: "h-7 text-sm", touch: "h-10 text-base" } as const;

export function Select({ value, onChange, options, label, size = "md", className }: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange}>
      <RadixSelect.Trigger
        aria-label={label}
        className={clsx(
          "inline-flex min-w-0 items-center justify-between gap-1 rounded-control border border-border-control bg-raised pr-1.5 pl-2 text-text hover:bg-hover",
          SIZES[size],
          className,
        )}
      >
        <span className="truncate">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon className="text-text-muted">
          <ChevronDown size={14} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control bg-overlay p-1 text-sm text-text shadow-popover"
        >
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className="relative flex h-7 cursor-default items-center rounded-[3px] pr-2 pl-6 outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-on-accent"
              >
                <RadixSelect.ItemIndicator className="absolute left-1.5">
                  <Check size={12} />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
