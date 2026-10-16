# Random walker

--8<-- "filters/random-walker-facts.md"

## Overview

The random walker splits the image into object and background from a few seeds, after Grady. Picture a walker at each pixel that steps to a neighbor at random, and rarely across an edge. The pixel joins the seed its walker most likely reaches first. scikit-image finds these chances exactly, by solving one linear system. The object goes to the Features panel and is drawn over the image. Click its row number to make it the selection. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels of a bright disk and a gray square on a dark ground with light noise. The first marks a small square seed inside the disk. With the defaults, a yellow circle sits inside the disk, well short of its edge. The probability panel is a soft white glow around the seed that fades to black, a little brighter inside the disk. With a seed map that also marks the square as background, the yellow circle is the same.](../../assets/figures/random-walker-light.svg#only-light){ width="480" }
  ![Four panels of a bright disk and a gray square on a dark ground with light noise. The first marks a small square seed inside the disk. With the defaults, a yellow circle sits inside the disk, well short of its edge. The probability panel is a soft white glow around the seed that fades to black, a little brighter inside the disk. With a seed map that also marks the square as background, the yellow circle is the same.](../../assets/figures/random-walker-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 10, and a small square selected inside the disk. Then the object with the defaults, the probability of the object, and the object with a seed map that also marks the square as background.</figcaption>
</figure>

## How it works

--8<-- "filters/random-walker-steps.md"

## Mathematical foundation

--8<-- "filters/random-walker-formula.md"

Grady noticed that the chance of reaching a seed first is the same as the voltage in an electric circuit. The links are resistors with conductance w. The object seeds are held at 1 volt and the background seeds at 0. The voltage at every other pixel solves a Laplace equation on the graph, which is a sparse linear system. No walker is ever simulated.

The result is a probability as well as a label. Pixels near 0.5 are where the walker is unsure, often far from all seeds or across weak edges.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/random-walker-params.md"

## Implementation

`random_walker_filter` in `engine/src/pixelnexus_engine/filters/interactive.py` passes the luma from 0 to 1 to `skimage.segmentation.random_walker`, with label 1 for object seeds and 2 for background seeds. It uses the conjugate gradient solver with a Jacobi preconditioner (mode `cg_j`), and asks for the probability of each label. The object is where the object probability is at least one half, so the object wins a tie, as in scikit-image. The seeds come from the selection, as the Seeds parameter says.

The selection is only an input here. Its catalog entry sets `selectionRole: markers`, so the studio runs the filter on the whole image. The object is a label map with one label.

## Worked example

--8<-- "examples/random-walker.md"

At scikit-image's beta of 130, the object covers only about half of the disk. The disk edge is blurred, so the brightness rises over a few pixels, and each step across it is small. So the edge is a weak barrier, and the many background seeds on the image edge win the outer part of the disk. A tighter solver tolerance gave the same result, so it is not a matter of the solver. At a beta of 500, the edge holds and the overlap is 0.952.

The square never joins the object, with or without a seed in it. It lies closer to the many seeds on the image edge than to the small seed in the disk.

## Complexity

--8<-- "filters/random-walker-complexity.md"

## Artifacts and limitations

--8<-- "filters/random-walker-limits.md"

## Tests

The probability must be scikit-image's on the luma. From a spot in a noisy disk with sharp edges, the object must overlap the disk by more than 0.95. The probability output must be white at the seed and black at the image edge. The representation must have its four stages.

--8<-- "filters/random-walker-tests.md"

## References

--8<-- "filters/random-walker-references.md"
