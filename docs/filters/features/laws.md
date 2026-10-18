# Laws' texture energy filters

--8<-- "filters/laws-facts.md"

## Overview

Laws' texture energy filters describe local texture. Five short vectors measure level, edge, spot, wave and ripple. Their outer products give 25 masks of 5x5. Each mask responds to one kind of pattern, and the average size of its response over a window is the texture energy.

<figure markdown="span">
  ![Three panels: the Noise patches image, the E5L5 energy map, and the S5S5 energy map. Both maps are dark in the clean quadrant and bright in the salt-and-pepper quadrant.](../../assets/figures/laws-light.svg#only-light){ width="480" }
  ![Three panels: the Noise patches image, the E5L5 energy map, and the S5S5 energy map. Both maps are dark in the clean quadrant and bright in the salt-and-pepper quadrant.](../../assets/figures/laws-dark.svg#only-dark){ width="480" }
  <figcaption>Different masks pick out different textures. Salt and pepper is strong in both maps.</figcaption>
</figure>

## How it works

1. Remove the local brightness by subtracting the local mean.
2. Correlate with a 5x5 mask made from two Laws vectors.
3. Average the absolute response over a window.

## Mathematical foundation

--8<-- "filters/laws-formula.md"

The vectors approximate a local average (L5), a first derivative (E5), a second derivative (S5) and higher-order patterns (W5, R5). Every vector except L5 adds up to 0, so masks with at least one of them ignore flat areas. Laws used a 15x15 window for the mean removal and the energy. Pairs such as E5L5 and L5E5 are the same mask turned by 90 degrees, and averaging them gives a measure that does not depend on the direction.

## Kernel or operator

The Inspector shows the 5x5 mask and its two vectors. The worked example below builds the E5L5 mask.

## Algorithm

--8<-- "filters/laws-steps.md"

## Parameters

--8<-- "filters/laws-params.md"

## Implementation

`lawsFilter` in `web/src/core/filters/edges/laws.ts` extends the plane once by its full support, the window plus 2, with the border mode. Then it removes the local mean, runs the separable mask and averages the absolute response, and cuts the extension off. Extending once keeps strips and whole images equal, which matters because the odd masks such as E5 change sign at a mirror border. The filter runs in the browser engine, in Web Workers, through the shared filter framework in `web/src/core/filters/run.ts`, which handles the border mode, the channel scope, alpha and the output mapping. By default it works on luma and gives a gray result.

## Worked example

--8<-- "examples/laws.md"

## Complexity

--8<-- "filters/laws-complexity.md"

## Artifacts and limitations

--8<-- "filters/laws-limits.md"

## Tests

The reference runs the same steps with SciPy on the extended plane. Before it is used, the script checks that the L5L5 energy of a flat image is 0 after mean removal. The test covers three mask, window and mean-removal settings for all five border modes.

--8<-- "filters/laws-tests.md"

## References

--8<-- "filters/laws-references.md"
