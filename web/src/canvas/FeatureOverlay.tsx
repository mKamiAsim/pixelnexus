import { imageToScreen, type ViewState } from "@/canvas/viewport";
import type { FeaturePoint } from "@/core/features/table";

/** The canvas draws at most this many features, the strongest first. */
export const DRAWN_FEATURES = 2000;

/**
 * Features found on the image, drawn over it: a circle of the feature's radius, a small cross
 * when it has none, and a line from the center for its angle. Each shape is drawn twice, dark
 * under light, so it shows on any image.
 */
export function FeatureOverlay({
  points,
  view,
}: {
  points: readonly FeaturePoint[];
  view: ViewState;
}) {
  if (points.length === 0) return null;
  const shapes = points.slice(0, DRAWN_FEATURES).map((p, i) => {
    const c = imageToScreen(view, p.x, p.y);
    const r = p.radius === null ? 0 : p.radius * view.zoom;
    const angle = p.angle === null ? null : (p.angle * Math.PI) / 180;
    const reach = Math.max(r, 4);
    return (
      <g key={i}>
        {r >= 1.5 ? (
          <circle cx={c.sx} cy={c.sy} r={r} />
        ) : (
          <path d={`M${c.sx - 3} ${c.sy}h6M${c.sx} ${c.sy - 3}v6`} />
        )}
        {angle === null ? null : (
          <line
            x1={c.sx}
            y1={c.sy}
            x2={c.sx + reach * Math.cos(angle)}
            y2={c.sy - reach * Math.sin(angle)}
          />
        )}
      </g>
    );
  });
  return (
    <svg
      aria-hidden
      data-testid="feature-overlay"
      className="pointer-events-none absolute inset-0 size-full"
      fill="none"
    >
      <g stroke="black" strokeWidth={3} strokeOpacity={0.6}>
        {shapes}
      </g>
      <g stroke="#ffd60a" strokeWidth={1.5}>
        {shapes}
      </g>
    </svg>
  );
}
