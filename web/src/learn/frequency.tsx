/**
 * The Frequency explorer: the spectrum of the patch around the probe, the response H of the
 * filter, their product, and the result of the real filter on the patch. The spectrum is that of
 * the patch extended with the border mode, the plane the filter really transforms.
 */
import { useMemo } from "react";

import { ProfilePlot } from "@/components/math/FrequencyView";
import { frequencyResponse, hasFrequencyResponse } from "@/core/filters/frequency";
import { sampleResponse, spectrumOf } from "@/core/filters/frequency/spectral";
import { createPlane } from "@/core/filters/planes";
import { browserFilter } from "@/core/filters/registry";
import { borderOf, runFilter } from "@/core/filters/run";
import { createImage, type RgbaImage } from "@/core/image/types";

import { channelOf, patchAt, valueAt } from "./common";
import { PixelCanvas, type WidgetProps } from "./widgets";

/** Gray image of values on a grid, with frequency 0 moved to the center, scaled by `top`. */
function centered(values: Float64Array, width: number, height: number, top: number): RgbaImage {
  const out = createImage(width, height);
  for (let j = 0; j < height; j++) {
    const y = (j + (height >> 1)) % height;
    for (let i = 0; i < width; i++) {
      const x = (i + (width >> 1)) % width;
      const g = Math.round((Math.max(0, values[j * width + i] ?? 0) / top) * 255);
      out.data.set([g, g, g, 255], (y * width + x) * 4);
    }
  }
  return out;
}

export function FrequencyExplorer({ filterId, values, image, point }: WidgetProps) {
  const data = useMemo(() => {
    const filter = browserFilter(filterId);
    if (!filter || !hasFrequencyResponse(filterId)) return null;
    const patch = patchAt(image, point.x, point.y);
    const channel = channelOf(values);
    const plane = createPlane(patch.width, patch.height);
    for (let y = 0; y < patch.height; y++) {
      for (let x = 0; x < patch.width; x++) {
        plane.data[y * patch.width + x] = valueAt(patch, x, y, channel);
      }
    }
    const spectrum = spectrumOf(plane, borderOf(values));
    const response = frequencyResponse(filterId, values, plane);
    if (!response) return null;
    const { width, height, fx, fy } = spectrum;
    const before = new Float64Array(width * height);
    const gain = new Float64Array(width * height);
    const after = new Float64Array(width * height);
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        const magnitude = Math.hypot(spectrum.re[k] ?? 0, spectrum.im[k] ?? 0);
        const h = response(fx[i] ?? 0, fy[j] ?? 0);
        before[k] = Math.log1p(magnitude);
        gain[k] = h;
        after[k] = Math.log1p(magnitude * Math.abs(h));
      }
    }
    // A flat black patch has a spectrum of zeros.
    const top = Math.max(...before) || 1;
    return {
      patch,
      result: runFilter(patch, filter, values).image,
      spectrum: centered(before, width, height, top),
      response: centered(gain, width, height, Math.max(1, ...gain)),
      product: centered(after, width, height, top),
      profile: sampleResponse(response).profile,
      grid: `${width} x ${height}`,
    };
  }, [filterId, values, image, point.x, point.y]);
  if (!data) return <p className="text-text-secondary">This filter has no frequency response.</p>;
  const spectra = [
    { label: "Spectrum |F|", image: data.spectrum },
    { label: "Response H", image: data.response },
    { label: "Product |F H|", image: data.product },
  ];
  const scale = data.spectrum.width <= 64 ? 2 : 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <figure className="flex flex-col gap-0.5">
          <figcaption className="text-2xs text-text-muted">Patch</figcaption>
          <PixelCanvas image={data.patch} scale={2} label="Patch around the probe" />
        </figure>
        <figure className="flex flex-col gap-0.5">
          <figcaption className="text-2xs font-semibold">Result</figcaption>
          <PixelCanvas image={data.result} scale={2} label="The filter result on the patch" />
        </figure>
      </div>
      <div className="flex flex-wrap gap-2">
        {spectra.map((s) => (
          <figure key={s.label} className="flex flex-col gap-0.5">
            <figcaption className="text-2xs text-text-muted">{s.label}</figcaption>
            <PixelCanvas image={s.image} scale={scale} label={`${s.label}, centered`} />
          </figure>
        ))}
      </div>
      <ProfilePlot profile={data.profile} />
      <p className="text-text-secondary">
        The patch is the 64x64 part around the probe. It is extended with the border mode to a{" "}
        {data.grid} grid, the plane the filter transforms. The spectra show log(1 + |F|), with
        frequency 0 in the center, on the same scale before and after. The plot shows H along the fx
        axis, from 0 to 0.5 cycles per pixel. On the whole image the result can differ near the
        patch edges.
      </p>
    </div>
  );
}
