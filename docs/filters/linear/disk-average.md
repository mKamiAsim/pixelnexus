# Disk averaging filter

--8<-- "filters/disk-average-facts.md"

## Overview

The disk averaging filter replaces each pixel with the plain average of a round window. A lens that is out of focus spreads every point of light into such a disk, so this filter is the standard model of defocus blur. It blurs the same amount in every direction, with a sharp outer edge.

<figure markdown="span">
  ![Three panels: three small bright squares on black, the same after a disk blur of radius 5, and after a Gaussian blur with sigma 2.5. The disk makes round spots with a clear edge. The Gaussian makes soft blobs.](../../assets/figures/disk-average-light.svg#only-light){ width="480" }
  ![Three panels: three small bright squares on black, the same after a disk blur of radius 5, and after a Gaussian blur with sigma 2.5. The disk makes round spots with a clear edge. The Gaussian makes soft blobs.](../../assets/figures/disk-average-dark.svg#only-dark){ width="480" }
  <figcaption>With Linear light on, a disk blur turns points of light into round spots. A Gaussian makes soft blobs.</figcaption>
</figure>

## How it works

1. Draw a disk of the chosen radius around the pixel.
2. Give each neighbor a weight equal to the part of its square that lies inside the disk.
3. Divide by the area of the disk, so the weights add up to 1.
4. Add up the weighted neighbors.

## Mathematical foundation

--8<-- "filters/disk-average-formula.md"

The area of the disk inside a cell is an exact computation. Along x, the disk covers the heights from \(-h(x)\) to \(h(x)\), with \(h(x) = \sqrt{R^2 - x^2}\). The covered height inside the cell is \(\min(y_1, h) - \max(y_0, -h)\) where it is positive. Its integral has a closed form, because

\[
\int \sqrt{R^2 - x^2}\, dx = \tfrac{1}{2}\left(x \sqrt{R^2 - x^2} + R^2 \arcsin \tfrac{x}{R}\right)
\]

where \(R\) is the radius and \(x\) the horizontal position. The code splits each cell at the points where \(h(x)\) crosses the cell's top or bottom, and integrates each piece exactly.

The Fourier transform of a disk is \(2 J_1(2\pi R f) / (2\pi R f)\), where \(J_1\) is the Bessel function of the first kind and \(f\) the frequency. It has zeros and negative lobes. So some fine patterns vanish completely and others come back with reversed contrast. This is also why defocus cannot be undone by a plain inverse filter.

## Kernel or operator

The kernels for radius 1 and 2, from the filter code. The cells on the edge of the disk have partial weights.

--8<-- "kernels/disk-average.md"

## Algorithm

--8<-- "filters/disk-average-steps.md"

## Parameters

--8<-- "filters/disk-average-params.md"

## Implementation

The kernel is built once per radius by `diskKernel` in `web/src/core/filters/linear/disk-average.ts`, then the image is correlated with it by the shared 2D code. The disk is not separable, so the cost grows with the square of the radius. On images with transparency, colors are averaged weighted by alpha. For a realistic defocus, turn on Linear light: the filter then averages light, as a lens does.

## Worked example

--8<-- "examples/disk-average.md"

## Complexity

--8<-- "filters/disk-average-complexity.md"

## Artifacts and limitations

--8<-- "filters/disk-average-limits.md"

## Tests

The reference kernel comes from numerical integration with `scipy.integrate.quad`, a different method from the closed form in the code. The fixture script checks it against point sampling with 400 by 400 points per cell before writing it. The test compares the kernels within 1e-10, and the filter with `scipy.ndimage.correlate` for three radii and all five border modes.

--8<-- "filters/disk-average-tests.md"

## References

--8<-- "filters/disk-average-references.md"
