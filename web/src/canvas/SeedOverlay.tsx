import { imageToScreen, type ViewState } from "@/canvas/viewport";
import type { Seed } from "@/core/selection/seeds";

/**
 * The seeds of the Click Select tool over the image: a filled dot for the object and a ring with
 * a bar for the background, so they differ in shape as well as color. Each is drawn dark under
 * light, so it shows on any image.
 */
export function SeedOverlay({ seeds, view }: { seeds: readonly Seed[]; view: ViewState }) {
  if (seeds.length === 0) return null;
  const shapes = seeds.map((seed, i) => {
    const c = imageToScreen(view, Math.floor(seed.x) + 0.5, Math.floor(seed.y) + 0.5);
    return seed.object ? (
      <circle key={i} cx={c.sx} cy={c.sy} r={4} fill="#34c759" data-seed="object" />
    ) : (
      <g key={i} data-seed="background">
        <circle cx={c.sx} cy={c.sy} r={4} fill="none" stroke="#ff453a" strokeWidth={2} />
        <path d={`M${c.sx - 3} ${c.sy}h6`} stroke="#ff453a" strokeWidth={2} />
      </g>
    );
  });
  return (
    <svg
      aria-hidden
      data-testid="seed-overlay"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <g stroke="black" strokeOpacity={0.6} strokeWidth={1}>
        {shapes}
      </g>
    </svg>
  );
}
