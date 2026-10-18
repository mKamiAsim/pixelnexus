# Dehazing

--8<-- "filters/dehaze-facts.md"

## Overview

Dehazing removes haze and fog from outdoor photos. It uses the dark channel prior of He, Sun and Tang: in a clear photo, almost every small patch holds a pixel that is dark in at least one color. Haze lifts those dark pixels toward the color of the air, so their brightness tells how thick the haze is. The filter turns that into a transmission map, refines it with a guided filter, and inverts the haze model. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: colored squares and red disks under a pale haze that thickens toward the top; the dehazed result with strong colors back; the transmission map, dark at the top and light at the bottom, with the squares faintly visible; and the scene without haze.](../../assets/figures/dehaze-light.svg#only-light){ width="480" }
  ![Four panels: colored squares and red disks under a pale haze that thickens toward the top; the dehazed result with strong colors back; the transmission map, dark at the top and light at the bottom, with the squares faintly visible; and the scene without haze.](../../assets/figures/dehaze-dark.svg#only-dark){ width="480" }
  <figcaption>Colored squares under haze that thickens toward the top, the result with the defaults, the transmission it found, and the scene without haze. The top rows come out a little too saturated, since the filter found a slightly dark air light.</figcaption>
</figure>

## How it works

1. Compute the dark channel: the darkest color of each pixel, then the darkest value in a square patch around it.
2. Take the air light A from the brightest 0.1 percent of the dark channel.
3. Compute a raw transmission from the dark channel of the image divided by A.
4. Refine the transmission with the guided filter, guided by the luma, so it follows object edges.
5. Remove the haze with the model, keeping the transmission at t0 or more.

## Mathematical foundation

--8<-- "filters/dehaze-formula.md"

The haze model says that each pixel mixes the true color of the scene with the color of the air, in proportions set by the transmission t. Far objects get less of their own light, so t falls with distance. If the scene were known, t would follow. He, Sun and Tang found a statistical shortcut. In outdoor photos, shadows, dark objects and strong colors make the minimum over colors and a small patch close to 0. So in a hazy photo, that minimum, divided by the air light, is about 1 - t. The patches make t blocky. The first paper smoothed it with soft matting, and the same authors later replaced that with the much faster guided filter. The prior fails on large white or sky areas, which have no dark pixel, and the filter then removes too much haze there.

## Kernel or operator

The Inspector asks the engine for the stages with the current settings. They are the dark channel, the air light, the raw transmission, the refinement and the recovery.

## Algorithm

--8<-- "filters/dehaze-steps.md"

## Parameters

--8<-- "filters/dehaze-params.md"

## Implementation

`dehaze` in `engine/src/pixelnexus_engine/filters/artifacts.py` calls `dehaze_parts`, which uses `dark_channel`, `atmospheric_light` and `guided_filter`. The minimum filter and the box means come from `scipy.ndimage`. The filter works on all three channels at once, on values from 0 to 1. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/dehaze.md"

## Complexity

--8<-- "filters/dehaze-complexity.md"

## Artifacts and limitations

--8<-- "filters/dehaze-limits.md"

## Tests

The guided filter must match `cv2.ximgproc.guidedFilter` of OpenCV, and the dark channel a brute-force minimum. The test scene is made with the haze model, with a black pixel in every patch and a strip of pure air light as sky. On it, the air light must be found exactly. Away from the sky, the transmission and the scene must be recovered. The transmission output must be gray, keep alpha and show the sky as thick haze. The engine API tests run jobs and check the stages of the representation.

--8<-- "filters/dehaze-tests.md"

## References

--8<-- "filters/dehaze-references.md"
