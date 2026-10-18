# Area opening

--8<-- "filters/area-opening-facts.md"

## Overview

An area opening removes bright spots smaller than a given area, whatever their shape, after Vincent. Unlike an opening with a structuring element, it keeps thin long structures when their area is large enough, and it never changes the shape of what it keeps. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. A gray ground with a light disk, a thin horizontal line, a thin vertical line, small bright specks and small dark pits. With an area of 16, the smallest specks are gone. With 64, all specks are gone and the lines stay. With 256, the horizontal line is gone too. The dark pits stay in every panel.](../../assets/figures/area-opening-light.svg#only-light){ width="480" }
  ![Four panels. A gray ground with a light disk, a thin horizontal line, a thin vertical line, small bright specks and small dark pits. With an area of 16, the smallest specks are gone. With 64, all specks are gone and the lines stay. With 256, the horizontal line is gone too. The dark pits stay in every panel.](../../assets/figures/area-opening-dark.svg#only-dark){ width="480" }
  <figcaption>Bright specks of 1 to 16 pixels, two thin lines, dark pits and a disk on a gray ground. Then the area opening with an area of 16, 64 and 256.</figcaption>
</figure>

## How it works

--8<-- "filters/area-opening-steps.md"

## Mathematical foundation

--8<-- "filters/area-opening-formula.md"

An opening with a disk removes everything the disk does not fit in, so it also removes thin lines and rounds corners. The area opening asks only how many pixels a component has. Vincent showed that it is the largest of all openings with connected elements of the given area, so it removes as little as an opening can.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/area-opening-params.md"

## Implementation

`area_opening_filter` in `engine/src/pixelnexus_engine/filters/tree_morphology.py` rounds each plane of the channel scope to 8 bits and calls `skimage.morphology.area_opening`. The library builds a max-tree of the image, after Salembier, Oliveras and Garrido, and removes each node with fewer pixels than the area.

## Worked example

--8<-- "examples/area-opening.md"

A speck is removed when it has fewer pixels than the area, so an area of 4 keeps the 2 x 2 specks, of exactly 4 pixels. At 64, every speck is gone, while the horizontal line of 70 pixels stays whole. At 256, the line goes too. The dark pits never change: an opening only removes bright structures.

## Complexity

--8<-- "filters/area-opening-complexity.md"

## Artifacts and limitations

--8<-- "filters/area-opening-limits.md"

## Tests

The result must equal scikit-image's own call. Small bright specks and a single pixel must go, while a thin line and a large rectangle stay exactly. The representation must have its three stages.

--8<-- "filters/area-opening-tests.md"

## References

--8<-- "filters/area-opening-references.md"
