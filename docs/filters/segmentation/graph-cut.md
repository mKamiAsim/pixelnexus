# Graph cuts

--8<-- "filters/graph-cut-facts.md"

## Overview

Graph cuts split the image into object and background from a few seeds, after Boykov and Jolly. Every pixel becomes a node in a graph. Each node is joined to its neighbors, and to two terminals, one for the object and one for the background. The cheapest cut that separates the terminals, and keeps every seed on its own side, gives the object. The object goes to the Features panel and is drawn over the image. Click its row number to make it the selection. The filter runs in the PixelNexus engine, with SciPy.

<figure markdown="span">
  ![Four panels of a bright disk and a gray square on a dark ground with light noise. The first marks a small square seed inside the disk. With the defaults, yellow outlines go around both the disk and the square. With a region weight of 0, only the disk is outlined. With a seed map that also marks the square as background, the disk is outlined and the square is full of small yellow specks.](../../assets/figures/graph-cut-light.svg#only-light){ width="480" }
  ![Four panels of a bright disk and a gray square on a dark ground with light noise. The first marks a small square seed inside the disk. With the defaults, yellow outlines go around both the disk and the square. With a region weight of 0, only the disk is outlined. With a seed map that also marks the square as background, the disk is outlined and the square is full of small yellow specks.](../../assets/figures/graph-cut-dark.svg#only-dark){ width="480" }
  <figcaption>A disk and a square with noise of sigma 10, and a small square selected inside the disk. Then the object with the defaults, with a region weight of 0, and with a seed map that also marks the square as background.</figcaption>
</figure>

## How it works

--8<-- "filters/graph-cut-steps.md"

## Mathematical foundation

--8<-- "filters/graph-cut-formula.md"

The energy has two parts that pull against each other. The region term asks each pixel to look like the seeds of its side. The boundary term asks the cut to be short and to run where neighbors differ. Boykov and Jolly showed that the minimum of this energy, with the seeds fixed, is a minimum cut of their graph. A maximum flow finds that cut exactly, so the result is the global best for the energy, not a local one.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/graph-cut-params.md"

## Implementation

`graph_cut` in `engine/src/pixelnexus_engine/filters/interactive.py` builds the graph itself and cuts it with `scipy.sparse.csgraph.maximum_flow`, which uses Dinic's method. The seeds come from the selection, as the Seeds parameter says. The region terms come from histograms of the luma of each set of seeds, with 32 bins of 8 levels. A level that no seed has gets the probability 0.0001, the same for both sides (our choice, so its cost is finite and favors neither side). SciPy needs whole-number capacities, so all weights are multiplied by 1000 and rounded. The object is every pixel the object terminal still reaches when the flow is at its maximum.

The selection is only an input here. Its catalog entry sets `selectionRole: markers`, so the studio runs the filter on the whole image. The object is a label map with one label.

## Worked example

--8<-- "examples/graph-cut.md"

With only edges, a region weight of 0, the cut follows the disk edge, with an overlap of 0.967 at the default contrast. At a contrast of 20, edges are too cheap to matter, and the cut shrinks to 88 pixels around the seed.

With the default region weight, the square joins the object. Its gray of 160 is far closer to the bright seed in the disk than to the dark image edge, so the region terms pull it in. Marking a spot in the square as background helps, but the square's histogram overlaps the disk's, so some of its pixels stay object. The figure shows them as specks. Graph cuts on brightness alone cannot do better here. GrabCut, which uses color, can.

## Complexity

--8<-- "filters/graph-cut-complexity.md"

## Artifacts and limitations

--8<-- "filters/graph-cut-limits.md"

## Tests

The seeds must follow the border and map rules, and missing seeds must stop with a message. The region costs must come from the histogram with its floor. On a small noisy image, the energy of the result, written out on its own in the test, must be no higher than that of 23 other labelings. From a spot in a noisy disk, the object must overlap the disk by more than 0.95. The representation must have its four stages.

--8<-- "filters/graph-cut-tests.md"

## References

--8<-- "filters/graph-cut-references.md"
