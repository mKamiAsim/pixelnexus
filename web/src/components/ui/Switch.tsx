import { Switch as RadixSwitch } from "radix-ui";
import { useId } from "react";

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs text-text-secondary select-none">
        {label}
      </label>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-4 w-7 shrink-0 rounded-full border border-border-control bg-raised data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <RadixSwitch.Thumb className="block size-3 translate-x-0.5 rounded-full bg-text-secondary transition-transform data-[state=checked]:translate-x-[13px] data-[state=checked]:bg-on-accent" />
      </RadixSwitch.Root>
    </div>
  );
}
