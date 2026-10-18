# Bilateral solver

--8<-- "filters/bilateral-solver-facts.md"

## Overview

The bilateral solver of Barron and Poole turns edge-aware smoothing into an optimization problem. It looks for the image that is as smooth as possible while it stays close to the input. Smooth here means that pixels near each other with similar colors get similar values. Pixels on either side of an edge between two colors do not have to agree, so the edge stays sharp.

Solving that problem on all pixels would be slow. The solver works on a coarse bilateral grid instead, whose cells group pixels of similar position, brightness and color. That makes the problem hundreds of times smaller. PixelNexus smooths the image guided by itself, with the same confidence everywhere.

<figure markdown="span">
  ![Three panels: a step and three thin lines with strong noise, the same at lambda 0, still noisy, and at lambda 128, clean with a sharp step and sharp lines. A few isolated specks remain.](../../assets/figures/bilateral-solver-light.svg#only-light){ width="480" }
  ![Three panels: a step and three thin lines with strong noise, the same at lambda 0, still noisy, and at lambda 128, clean with a sharp step and sharp lines. A few isolated specks remain.](../../assets/figures/bilateral-solver-dark.svg#only-dark){ width="480" }
  <figcaption>At lambda 0 each pixel gets the mean of its grid cell. At lambda 128 cells of similar color agree, and the noise goes.</figcaption>
</figure>

## How it works

1. Sort the pixels into cells by position, brightness and color.
2. Ask every cell to be close to the mean of its pixels, and similar to its neighboring cells.
3. Solve for all cells at once.
4. Give each pixel the value of its cell.

## Mathematical foundation

--8<-- "filters/bilateral-solver-formula.md"

The bilateral affinity W of two pixels is high when they are close in position and in color. On the grid, it becomes S transposed B S: two pixels are linked when their cells are the same or next to each other. Bistochastization scales the rows of B so that each one sums to the number of pixels of its vertex. Without it, cells with many pixels would pull harder. The problem is quadratic, so setting its gradient to 0 gives a linear system. The system is sparse and positive definite, which suits the conjugate gradient method.

At lambda 0 the smoothness term vanishes, and every pixel gets the mean of its cell. With noise of sigma 20 and a brightness sigma of 16, noise spreads the pixels over many cells, so this mean removes little noise. Larger lambda joins neighboring cells, and the noise goes.

## Kernel or operator

There is no fixed kernel. The Inspector shows the grid, the system and the slice with the current values.

## Algorithm

--8<-- "filters/bilateral-solver-steps.md"

## Parameters

--8<-- "filters/bilateral-solver-params.md"

## Implementation

`bilateral_solver.py` in `engine/src/pixelnexus_engine/filters` builds the grid with `numpy.unique` over the rounded-down cell coordinates, and S and B as SciPy sparse matrices. It solves with `scipy.sparse.linalg.cg`, with the diagonal of A as a preconditioner, from the cell means. It stops at a relative tolerance of 0.00001 or after 50 steps. The guide in Y'CbCr, the fixed confidence and the defaults are PixelNexus's own.

## Worked example

--8<-- "examples/bilateral-solver.md"

The PSNR rises with lambda, fast at first. In the figure, at lambda 128, the step and the thin lines stay sharp, since their colors fall into other cells than the background.

## Complexity

--8<-- "filters/bilateral-solver-complexity.md"

## Artifacts and limitations

--8<-- "filters/bilateral-solver-limits.md"

## Tests

The tests check what follows from the definitions. A flat image comes back unchanged. The vertices are exactly the rounded-down cells. At lambda 0 each pixel gets the mean of its cell. After bistochastization, the scaled blur keeps the pixel count of each vertex within 5 percent. The result solves the linear system. On a noisy disk, the PSNR rises by more than 6 dB, while the pixels on either side of the edge stay over 100 levels apart.

--8<-- "filters/bilateral-solver-tests.md"

## References

--8<-- "filters/bilateral-solver-references.md"
