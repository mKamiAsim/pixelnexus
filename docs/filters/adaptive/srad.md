# Speckle reducing anisotropic diffusion

--8<-- "filters/srad-facts.md"

## Overview

Speckle reducing anisotropic diffusion, SRAD, combines the Lee filter with anisotropic diffusion. Each step lets values flow between neighbors, and the flow is blocked at edges. Unlike Perona-Malik diffusion, the edge measure is relative to the brightness, the instantaneous coefficient of variation. So speckle, which grows with the brightness, is smoothed the same way in dark and bright areas.

<figure markdown="span">
  ![Three panels: disks with gray speckle, the SRAD result after 30 steps with smooth dark and bright areas and sharp edges, and anisotropic diffusion after 30 steps that leaves speckle in the bright disks.](../../assets/figures/srad-light.svg#only-light){ width="480" }
  ![Three panels: disks with gray speckle, the SRAD result after 30 steps with smooth dark and bright areas and sharp edges, and anisotropic diffusion after 30 steps that leaves speckle in the bright disks.](../../assets/figures/srad-dark.svg#only-dark){ width="480" }
  <figcaption>SRAD removes the speckle in both the dark background and the bright disks, and keeps the edges sharp.</figcaption>
</figure>

## How it works

1. For each pixel, compute the differences to its four neighbors.
2. From them, compute q, the variation relative to the brightness, and the coefficient c.
3. Add a time step times the divergence of c times the differences.
4. Lower the speckle scale a little and repeat.

## Mathematical foundation

--8<-- "filters/srad-formula.md"

Yu and Acton show that the Lee and Frost filters are discrete steps of a diffusion. The instantaneous coefficient of variation q acts as an edge detector: it is near the speckle scale q0 in speckle and larger on edges. The coefficient c is near 1 where q is close to q0 and near 0 where q is much larger. The speckle scale falls with time, q0 exp(-rho t), so the diffusion slows down as the speckle goes. Here c is limited to 0 to 1.

## Kernel or operator

The Inspector shows the update step and the coefficient with the current settings. The worked example below runs one step for one pixel.

## Algorithm

--8<-- "filters/srad-steps.md"

## Parameters

--8<-- "filters/srad-params.md"

## Implementation

`sradStep` in `web/src/core/filters/adaptive/srad.ts` computes c for a whole plane, then the update. The plane is extended once by one pixel per step with the border mode, all steps run, and the frame is cut off. A tiny constant avoids a division by 0 on black pixels. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`. It handles the border mode, the channel scope, alpha and the rounding to 8 bits. Each strip of the image gets a halo as wide as the support radius, so strips give exactly the pixels of a whole-image run.

## Worked example

--8<-- "examples/srad.md"

## Complexity

--8<-- "filters/srad-complexity.md"

## Artifacts and limitations

--8<-- "filters/srad-limits.md"

## Tests

The reference runs the same steps with NumPy on the extended plane, on an input whose values are all above 0. Before it is used, the script checks that a huge speckle scale, where c is 1 everywhere, gives linear diffusion. The test covers four steps for all five border modes.

--8<-- "filters/srad-tests.md"

## References

--8<-- "filters/srad-references.md"
