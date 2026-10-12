# Color Range, brightness and hue selections

## Color Range

--8<-- "tools/color-range-facts.md"

## Select by brightness

--8<-- "tools/select-brightness-facts.md"

## Select by hue and saturation

--8<-- "tools/select-hsv-facts.md"

## Overview

These three commands in the **Select** menu select by color or tone across the whole image, not only connected pixels. Unlike the Magic Wand, they give a **soft** selection: pixels a little outside the range are partly selected. Filters then fade out smoothly.

## How to use them

Each command opens a dialog with its settings, a small preview and the share of the image it selects.

- **Color Range**: click the preview to sample a color. **Shift**-click adds a sample, **Alt**-click removes the nearest one. To sample with the keyboard, pin a pixel with the Probe tool (**I**) first, then press **Add the Probe pixel**. The **Select** list also has the shadows, midtones and highlights presets.
- **Select by brightness**: set the range of brightness, from 0 (black) to 255 (white).
- **Select by hue and saturation**: set the center hue and the ranges of saturation and value.

The buttons at the bottom of the settings say how the result combines with the current selection. **Preview** switches between the selection in gray and the image.

## How it works

Color Range:

--8<-- "tools/color-range-steps.md"

Select by brightness:

--8<-- "tools/select-brightness-steps.md"

Select by hue and saturation:

--8<-- "tools/select-hsv-steps.md"

## Mathematical foundation

All three use the same soft ramp. For a distance \(d\), a full range \(F\) and a softness \(S\):

\[
\rho(d; F, S) =
\begin{cases}
1 & \text{if } d \le F \\
\max\!\left(0,\ 1 - \dfrac{d - F}{S}\right) & \text{if } d > F \text{ and } S > 0 \\
0 & \text{otherwise}
\end{cases}
\]

where

- \(d\) is a distance, in color or in brightness,
- \(F\) is the largest distance that is still fully selected,
- \(S\) is the distance over which the value falls from 1 to 0.

The mask value is \(255\,\rho\), rounded. This is an exact computation.

**Color Range.** With samples \(C_k\), the value at pixel \(p\) is \(\max_k \rho(\lVert C(p) - C_k \rVert; T, F)\), with \(T\) the tolerance and \(F\) the fuzziness. The color distance is the one the [Magic Wand](magic-wand.md) uses. Localized colors add a factor. Each term is multiplied by \(\max(0, 1 - \delta_k / R)\), where \(\delta_k\) is the distance in pixels from the sample. \(R\) is the range setting in percent of the longer image side, turned into pixels.

The tone presets use BT.709 luma \(Y\) from 0 to 255:

\[
w_{\text{shadows}} = \operatorname{clamp}\!\left(\frac{128 - Y}{64}\right), \quad
w_{\text{midtones}} = \operatorname{clamp}\!\left(1 - \frac{|Y - 128|}{64}\right), \quad
w_{\text{highlights}} = \operatorname{clamp}\!\left(\frac{Y - 128}{64}\right)
\]

where clamp limits the value to 0 to 1. The three weights add up to 1 for every \(Y\), so the presets split the tones without gaps.

**Brightness.** With the range \([L, H]\) and softness \(S\), the value is \(\min\big(\rho(L - Y; 0, S),\ \rho(Y - H; 0, S)\big)\).

**Hue and saturation.** The hue distance goes around the color circle, so 350 and 10 degrees are 20 degrees apart. The value is the smallest of three ramps: the hue distance against the hue width, and the distances of saturation and value outside their ranges. The softness applies to each, in degrees for hue and percent for the others. A hue width of 180 accepts every hue.

## Parameters

Color Range:

--8<-- "tools/color-range-params.md"

Select by brightness:

--8<-- "tools/select-brightness-params.md"

Select by hue and saturation:

--8<-- "tools/select-hsv-params.md"

## Implementation

The dialog previews the result on a copy of the image at most 240 pixels on the longer side. The color samples are read from the full image, so the preview uses the same colors as the final result. **OK** computes the selection at full size.

## Limitations

- Color Range selects similar colors everywhere. Use localized colors to keep it near your samples.
- Gray pixels have no real hue. Keep the saturation minimum above 0 to leave them out of a hue selection.

## Tests

--8<-- "tools/color-range-tests.md"
