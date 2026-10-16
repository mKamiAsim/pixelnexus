# Attribute opening

--8<-- "filters/attribute-opening-facts.md"

## Overview

An attribute opening removes bright components that fail a size test, after Breen and Jones, and keeps every other structure exactly. Here the test is the area or the diameter, the longer side of the bounding box. A diameter opening removes compact blobs but keeps long thin lines, which an area opening of a similar size would remove. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. A gray ground with a light disk, a thin horizontal line, a thin vertical line, small bright specks and small dark pits. With a diameter of 8, all specks are gone and both lines stay. With an area of 32, all specks are gone and both lines stay. With a diameter of 32, the specks are gone and the lines still stay.](../../assets/figures/attribute-opening-light.svg#only-light){ width="480" }
  ![Four panels. A gray ground with a light disk, a thin horizontal line, a thin vertical line, small bright specks and small dark pits. With a diameter of 8, all specks are gone and both lines stay. With an area of 32, all specks are gone and both lines stay. With a diameter of 32, the specks are gone and the lines still stay.](../../assets/figures/attribute-opening-dark.svg#only-dark){ width="480" }
  <figcaption>Bright specks of 1 to 16 pixels, two thin lines, dark pits and a disk on a gray ground. Then the attribute opening with a diameter of 8, an area of 32, and a diameter of 32.</figcaption>
</figure>

## How it works

--8<-- "filters/attribute-opening-steps.md"

## Mathematical foundation

--8<-- "filters/attribute-opening-formula.md"

Breen and Jones generalized the area opening. Any attribute that only grows as a component grows gives an opening, when components below a threshold are removed. The area is one such attribute. The diameter, here the longer side of the bounding box, is another. It measures extent, not mass, so a line of 70 by 1 pixels has a diameter of 70 and an area of only 70.

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/attribute-opening-params.md"

## Implementation

`attribute_opening` in `engine/src/pixelnexus_engine/filters/tree_morphology.py` rounds each plane of the channel scope to 8 bits and calls `skimage.morphology.diameter_opening` or `area_opening`.

## Worked example

--8<-- "examples/attribute-opening.md"

A diameter of 4 removes the specks of 1 to 3 pixels across and keeps the 4 x 4 ones, since their diameter is 4. A diameter of 8 removes all specks. The lines keep their diameters of 70 and 80, so they stay even at 32. By area, the line of 70 pixels would go at 256, as the area opening shows.

## Complexity

--8<-- "filters/attribute-opening-complexity.md"

## Artifacts and limitations

--8<-- "filters/attribute-opening-limits.md"

## Tests

The diameter opening must equal scikit-image's own call and keep a line of 30 by 1 pixels that an area of 31 removes. The representation must have its three stages.

--8<-- "filters/attribute-opening-tests.md"

## References

--8<-- "filters/attribute-opening-references.md"
