import { clsx } from "clsx";
import { Crosshair, X } from "lucide-react";
import { useState } from "react";

import { fixed, hexColor } from "@/app/format";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { luma709, rgbToHsv, rgbToLab } from "@/core/color/convert";
import { getChannel, type RgbaImage } from "@/core/image/types";
import { activeDocument, useDocuments } from "@/state/documents";
import { useUi } from "@/state/ui";

type WindowChannel = "luma" | "r" | "g" | "b" | "a";

const CHANNELS: readonly { value: WindowChannel; label: string }[] = [
  { value: "luma", label: "Luma" },
  { value: "r", label: "R" },
  { value: "g", label: "G" },
  { value: "b", label: "B" },
  { value: "a", label: "A" },
];

const WINDOW = 5;

function channelValue(image: RgbaImage, x: number, y: number, channel: WindowChannel): number {
  if (channel === "luma") {
    return luma709(
      getChannel(image, x, y, 0),
      getChannel(image, x, y, 1),
      getChannel(image, x, y, 2),
    );
  }
  return getChannel(image, x, y, { r: 0, g: 1, b: 2, a: 3 }[channel]);
}

/** Exact values of one pixel and its 5x5 neighborhood. */
export function InfoPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const hover = useUi((s) => s.hover);
  const probe = useUi((s) => s.probe);
  const setProbe = useUi((s) => s.setProbe);
  const setTool = useUi((s) => s.setTool);
  const [channel, setChannel] = useState<WindowChannel>("luma");

  if (!doc) {
    return <p className="p-3 text-sm text-text-secondary">Open an image to read pixel values.</p>;
  }
  const image = doc.current;
  const inside = (p: { x: number; y: number }) => p.x < image.width && p.y < image.height;
  const pinned = probe && probe.documentId === doc.id && inside(probe) ? probe : null;
  const hovered = hover && hover.documentId === doc.id && inside(hover) ? hover : null;
  const point = pinned ?? hovered;

  if (!point) {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-sm text-text-secondary">
        <p>Move the pointer over the image to read its values.</p>
        <p>Click with the Probe tool to pin one pixel.</p>
        <button
          type="button"
          onClick={() => setTool("probe")}
          className="flex items-center gap-1.5 rounded-control px-1.5 py-1 text-xs text-accent-fg hover:bg-hover"
        >
          <Crosshair size={13} /> Use the Probe tool (I)
        </button>
      </div>
    );
  }

  const r = getChannel(image, point.x, point.y, 0);
  const g = getChannel(image, point.x, point.y, 1);
  const b = getChannel(image, point.x, point.y, 2);
  const a = getChannel(image, point.x, point.y, 3);
  const hsv = rgbToHsv(r, g, b);
  const lab = rgbToLab(r, g, b);
  const half = Math.floor(WINDOW / 2);
  const offsets = Array.from({ length: WINDOW }, (_, i) => i - half);

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="checkerboard relative size-7 shrink-0 overflow-hidden rounded-control border border-border"
        >
          <span
            className="absolute inset-0"
            style={{ background: `rgb(${r} ${g} ${b} / ${a / 255})` }}
          />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-text">
            {pinned ? "Pinned pixel" : "Pixel under the pointer"}
          </span>
          <span className="tabular font-mono text-text-secondary">
            x {point.x}, y {point.y}
          </span>
        </div>
        {pinned ? (
          <IconButton
            label="Unpin pixel"
            icon={<X size={13} />}
            size="sm"
            className="ml-auto"
            onClick={() => setProbe(null)}
          />
        ) : null}
      </div>
      <dl className="tabular grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
        <dt className="font-sans text-text-muted">RGBA</dt>
        <dd>
          {r}, {g}, {b}, {a}
        </dd>
        <dt className="font-sans text-text-muted">Hex</dt>
        <dd>{hexColor(r, g, b)}</dd>
        <dt className="font-sans text-text-muted">Luma</dt>
        <dd>{fixed(luma709(r, g, b), 1)}</dd>
        <dt className="font-sans text-text-muted">HSV</dt>
        <dd>
          {fixed(hsv[0], 0)}°, {fixed(hsv[1] * 100, 0)}%, {fixed(hsv[2] * 100, 0)}%
        </dd>
        <dt className="font-sans text-text-muted">Lab</dt>
        <dd>{lab.map((v) => fixed(v, 1)).join(", ")}</dd>
      </dl>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-text-secondary">5x5 window</span>
          <SegmentedControl
            label="Channel shown in the window"
            value={channel}
            onChange={(value) => setChannel(value as WindowChannel)}
            segments={CHANNELS}
          />
        </div>
        <table className="tabular w-full table-fixed border-collapse font-mono text-2xs">
          <caption className="sr-only">
            {CHANNELS.find((c) => c.value === channel)?.label} values around x {point.x}, y{" "}
            {point.y}. The center cell is the pixel itself.
          </caption>
          <tbody>
            {offsets.map((dy) => (
              <tr key={dy}>
                {offsets.map((dx) => {
                  const x = point.x + dx;
                  const y = point.y + dy;
                  const outside = x < 0 || y < 0 || x >= image.width || y >= image.height;
                  const value = outside ? 0 : channelValue(image, x, y, channel);
                  const shade = Math.round(value);
                  return (
                    <td
                      key={dx}
                      aria-label={outside ? "Outside the image" : undefined}
                      className={clsx(
                        "h-6 border border-border-subtle text-center",
                        dx === 0 && dy === 0 && "outline-2 -outline-offset-2 outline-accent",
                        outside && "bg-raised text-text-disabled",
                      )}
                      style={
                        outside
                          ? undefined
                          : {
                              background: `rgb(${shade} ${shade} ${shade})`,
                              color: shade > 140 ? "#000" : "#fff",
                            }
                      }
                    >
                      {outside ? "" : channel === "luma" ? fixed(value, 0) : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
