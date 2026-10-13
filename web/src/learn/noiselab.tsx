/**
 * The Noise lab: damage a patch of the image with a known noise or blur, repair it with the
 * selected filter and its current settings, and measure both against the clean patch. Every
 * step runs the real filter code.
 */
import { useMemo, useState } from "react";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { browserFilter } from "@/core/filters/registry";
import { runFilter } from "@/core/filters/run";
import type { Params } from "@/core/filters/types";
import { createImage, type RgbaImage } from "@/core/image/types";
import { qualityMetrics } from "@/core/metrics/quality";

import { patchAt, round } from "./common";
import { PixelCanvas, type WidgetProps } from "./widgets";

type Damage = "gaussian" | "salt-pepper" | "speckle" | "poisson" | "periodic" | "blur";

const DAMAGES: readonly { value: Damage; label: string; note: string }[] = [
  { value: "gaussian", label: "Gaussian", note: "Gaussian noise with sigma 20." },
  {
    value: "salt-pepper",
    label: "Salt and pepper",
    note: "10 percent of the pixels turn white or black.",
  },
  { value: "speckle", label: "Speckle", note: "Multiplicative noise with sigma 0.25." },
  { value: "poisson", label: "Poisson", note: "Photon noise with 20 photons at white." },
  {
    value: "periodic",
    label: "Periodic",
    note: "A vertical stripe pattern of amplitude 40 and period 8 pixels.",
  },
  { value: "blur", label: "Blur", note: "A known Gaussian blur with sigma 2." },
];

const run = (image: RgbaImage, id: string, params: Params) => {
  const filter = browserFilter(id);
  return filter ? runFilter(image, filter, params).image : image;
};

function damage(image: RgbaImage, kind: Damage): RgbaImage {
  switch (kind) {
    case "gaussian":
      return run(image, "noise-gaussian", { sigma: 20, seed: 7 });
    case "salt-pepper":
      return run(image, "noise-salt-pepper", { amount: 0.1, salt: 0.5, seed: 7 });
    case "speckle":
      return run(image, "noise-speckle", { sigma: 0.25, seed: 7 });
    case "poisson":
      return run(image, "noise-poisson", { peak: 20, seed: 7 });
    case "blur":
      return run(image, "gaussian", { sigma: 2 });
    case "periodic": {
      const out = createImage(image.width, image.height);
      for (let i = 0; i < image.width * image.height; i++) {
        const stripe = 40 * Math.sin((2 * Math.PI * (i % image.width)) / 8);
        for (let c = 0; c < 3; c++) out.data[i * 4 + c] = (image.data[i * 4 + c] ?? 0) + stripe;
        out.data[i * 4 + 3] = image.data[i * 4 + 3] ?? 255;
      }
      return out;
    }
  }
}

export function NoiseLab({ filterId, values, image, point }: WidgetProps) {
  const [kind, setKind] = useState<Damage>("gaussian");
  const result = useMemo(() => {
    const clean = patchAt(image, point.x, point.y);
    const noisy = damage(clean, kind);
    const repaired = run(noisy, filterId, values);
    const enough = clean.width >= 11 && clean.height >= 11;
    return {
      clean,
      noisy,
      repaired,
      before: enough ? qualityMetrics(noisy, clean) : null,
      after: enough ? qualityMetrics(repaired, clean) : null,
    };
  }, [image, point.x, point.y, kind, filterId, values]);
  const note = DAMAGES.find((d) => d.value === kind)?.note ?? "";
  const db = (v: number) => (Number.isFinite(v) ? `${round(v, 2)} dB` : "equal");
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label="Kind of damage"
        value={kind}
        onChange={(v) => setKind(v as Damage)}
        segments={DAMAGES.map(({ value, label }) => ({ value, label }))}
      />
      <p className="text-text-secondary">{note} The patch is the 64x64 area around the probe.</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["Clean", result.clean],
            ["Damaged", result.noisy],
            ["Repaired", result.repaired],
          ] as const
        ).map(([title, picture]) => (
          <figure key={title} className="flex flex-col gap-0.5">
            <figcaption className="text-2xs text-text-muted">{title}</figcaption>
            <PixelCanvas image={picture} scale={2} label={`${title} patch`} />
          </figure>
        ))}
      </div>
      {result.before && result.after ? (
        <table className="tabular border-collapse text-2xs" aria-label="Noise lab metrics">
          <thead>
            <tr className="text-text-muted">
              <th className="pr-3 text-left font-normal">Against the clean patch</th>
              <th className="pr-3 text-right font-normal">PSNR</th>
              <th className="text-right font-normal">SSIM</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="pr-3 text-left font-normal">
                Damaged
              </th>
              <td className="pr-3 text-right font-mono">{db(result.before.psnr)}</td>
              <td className="text-right font-mono">{round(result.before.ssim, 4)}</td>
            </tr>
            <tr>
              <th scope="row" className="pr-3 text-left font-normal">
                Repaired
              </th>
              <td className="pr-3 text-right font-mono">{db(result.after.psnr)}</td>
              <td className="text-right font-mono">{round(result.after.ssim, 4)}</td>
            </tr>
          </tbody>
        </table>
      ) : null}
      <p>
        The repair uses the selected filter with its current settings. A higher PSNR and an SSIM
        closer to 1 mean the repaired patch is closer to the clean one.
      </p>
    </div>
  );
}
