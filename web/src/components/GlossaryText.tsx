import { Tooltip as RadixTooltip } from "radix-ui";
import { useMemo } from "react";

import { glossarySegments } from "@/app/glossary";

/**
 * Text with glossary terms marked by a dotted underline. Hover or focus a term to read its
 * plain definition from catalog/glossary.yaml. Text between backticks shows as code, such as a
 * kernel to type.
 */
export function GlossaryText({ text }: { text: string }) {
  const parts = text.split("`");
  if (parts.length < 3) return <TermText text={text} />;
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="rounded-[3px] bg-raised px-1 font-mono text-[0.95em]">
            {part}
          </code>
        ) : (
          <TermText key={index} text={part} />
        ),
      )}
    </>
  );
}

function TermText({ text }: { text: string }) {
  const segments = useMemo(() => glossarySegments(text), [text]);
  return (
    <>
      {segments.map((segment, index) =>
        segment.entry ? (
          <RadixTooltip.Root key={index}>
            <RadixTooltip.Trigger asChild>
              <span
                tabIndex={0}
                className="cursor-help underline decoration-text-muted decoration-dotted underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-focus"
              >
                {segment.text}
              </span>
            </RadixTooltip.Trigger>
            <RadixTooltip.Portal>
              <RadixTooltip.Content
                side="top"
                sideOffset={4}
                collisionPadding={8}
                className="z-50 max-w-72 rounded-control bg-overlay px-2.5 py-1.5 text-xs text-text shadow-popover"
              >
                <span className="font-semibold">{segment.entry.term}.</span>{" "}
                {segment.entry.definition}
              </RadixTooltip.Content>
            </RadixTooltip.Portal>
          </RadixTooltip.Root>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
