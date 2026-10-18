# Area closing

--8<-- "filters/area-closing-facts.md"

## Overview

An area closing fills dark pits smaller than a given area, whatever their shape, after Vincent. It is the dual of the area opening: it treats dark spots as the area opening treats bright ones. Thin dark lines stay when their area is large, and nothing else changes. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. A gray ground with a light disk, a thin horizontal line, a thin vertical line, small bright specks and small dark pits. With an area of 16, 64 and 256, the dark pits are gone, while every bright speck, the lines and the disk stay.](../../assets/figures/area-closing-light.svg#only-light){ width="480" }
  ![Four panels. A gray ground with a light disk, a thin horizontal line, a thin vertical line, small bright specks and small dark pits. With an area of 16, 64 and 256, the dark pits are gone, while every bright speck, the lines and the disk stay.](../../assets/figures/area-closing-dark.svg#only-dark){ width="480" }
  <figcaption>Bright specks, two thin lines, dark pits of 9 pixels and a disk on a gray ground. Then the area closing with an area of 16, 64 and 256.</figcaption>
</figure>

## How it works

--8<-- "filters/area-closing-steps.md"

## Mathematical foundation

--8<-- "filters/area-closing-formula.md"

An area closing is an area opening of the inverted image, inverted back. So a dark component with fewer pixels than the area rises to the level of its surroundings.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/area-closing-params.md"

## Implementation

`area_closing_filter` in `engine/src/pixelnexus_engine/filters/tree_morphology.py` rounds each plane of the channel scope to 8 bits and calls `skimage.morphology.area_closing`, which works on the max-tree of the inverted image.

## Worked example

--8<-- "examples/area-closing.md"

The 22 dark pits have 9 pixels each, so an area of 4 keeps them and 16 fills all of them. The bright specks, the lines and the disk never change, since a closing only fills dark structures.

## Complexity

--8<-- "filters/area-closing-complexity.md"

## Artifacts and limitations

--8<-- "filters/area-closing-limits.md"

## Tests

The result must equal scikit-image's own call with 4 neighbors, and a dark bar of 20 pixels must be filled at an area of 30. The representation must have its three stages.

--8<-- "filters/area-closing-tests.md"

## References

--8<-- "filters/area-closing-references.md"
