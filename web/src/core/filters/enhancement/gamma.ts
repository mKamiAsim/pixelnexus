/**
 * Gamma correction (power law). Catalog entry: catalog/filters/enhancement/gamma.yaml.
 *
 * out = 255 * (in / 255)^gamma, the power law of Gonzalez and Woods and of
 * skimage.exposure.adjust_gamma. Gamma below 1 brightens and above 1 darkens.
 */
import { read, type Params, type PointFilter } from "@/core/filters/types";

const gammaOf = (params: Params) => read.number(params, "gamma", 1);

export function gammaTransfer(gamma: number): (value: number) => number {
  return (value) => 255 * Math.pow(Math.min(255, Math.max(0, value)) / 255, gamma);
}

export const gammaFilter: PointFilter = {
  id: "gamma",
  kind: "point",
  radius: () => 0,
  transfer: (params) => gammaTransfer(gammaOf(params)),
  representation: (params) => {
    const transfer = gammaTransfer(gammaOf(params));
    return { kind: "curve", values: Array.from({ length: 256 }, (_, v) => transfer(v)) };
  },
};
