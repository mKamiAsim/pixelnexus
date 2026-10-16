# Watershed

--8<-- "filters/watershed-facts.md"

## Overview

The watershed treats the image as a height map. Here the height map is the gradient of the image, so edges are ridges and flat areas are valleys. Water rises from the valleys, and where floods from two valleys meet, a boundary forms. Every noise dip would be a valley of its own, so only valleys at least h deep start a flood. The regions go to the Features panel with their area, centroid and mean brightness, and are drawn over the image in their label colors. Click a row number in the panel to make that region the selection, or select all regions at once. The filter runs in the PixelNexus engine, with scikit-image.

<figure markdown="span">
  ![Four panels. The Disks test image with grainy noise. The elevation is black with thin bright rings on the edges of the six disks. With the depth h at 2, the regions show each disk in its own color, but the ground is dotted with many small specks of other colors. With h at 20, the image has exactly seven regions, the six disks and the ground.](../../assets/figures/watershed-light.svg#only-light){ width="480" }
  ![Four panels. The Disks test image with grainy noise. The elevation is black with thin bright rings on the edges of the six disks. With the depth h at 2, the regions show each disk in its own color, but the ground is dotted with many small specks of other colors. With h at 20, the image has exactly seven regions, the six disks and the ground.](../../assets/figures/watershed-dark.svg#only-dark){ width="480" }
  <figcaption>The Disks test image with noise of sigma 8. Then the elevation, the gradient after a blur of sigma 1, and the regions in their label colors with the depth h at 2 and at 20.</figcaption>
</figure>

## How it works

--8<-- "filters/watershed-steps.md"

## Mathematical foundation

--8<-- "filters/watershed-formula.md"

Flooding by immersion, as Vincent and Soille describe it, sorts the pixels by elevation and processes them from the lowest. A pixel next to exactly one flooded basin joins it. A pixel where two basins meet stays on the boundary or joins one of them, depending on the implementation. Here scikit-image gives every pixel a region, so there are no boundary lines.

The markers decide how many regions there are. The h-minima transform raises the elevation by h and rebuilds it from below by reconstruction. Valleys shallower than h fill up completely, and only deeper ones keep a floor that becomes a marker. A valley's depth is how far it is below the lowest pass to a deeper valley.

The compact watershed of Neubert and Protzel adds the distance from the marker to the elevation, weighted by the compactness. The regions then become rounder and more equal in size, like superpixels.

## Kernel or operator

There is no kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/watershed-params.md"

## Implementation

`watershed_filter` in `engine/src/pixelnexus_engine/filters/segmentation.py` blurs the luma in pixel levels with `scipy.ndimage.gaussian_filter`, repeating the edge pixels, and takes `skimage.filters.sobel` as the elevation. A ramp of 1 level per pixel then has an elevation of about 1.4. The markers are `skimage.morphology.h_minima` of the elevation, labeled with 8-connectivity. Then `skimage.segmentation.watershed` floods from them, with 4-connected neighbors.

The h-minima transform counts every minimum that ties exactly with the lowest elevation, however shallow its valley. A gradient can have such exact ties, such as several pixels at 0. So the filter first adds a ramp of at most 1e-6, growing in raster order, which breaks the ties. That choice is ours. The elevation output shows the gradient, stretched so its largest value is white.

The regions output is a label map. The engine sends it with a table of the regions, and the studio draws it over the image. See [the science engine](../../architecture/science-engine.md) for how label maps travel.

## Worked example

--8<-- "examples/watershed.md"

The blur matters most. Without it, noise makes thousands of shallow valleys at small h, and even h of 20 leaves 11 regions. With the default blur of sigma 1, a depth of 20 gives exactly the 7 regions of the image. The disk edges reach an elevation of about 93, far above the noise, so any depth between 20 and 40 works.

## Complexity

--8<-- "filters/watershed-complexity.md"

## Artifacts and limitations

--8<-- "filters/watershed-limits.md"

## Tests

The elevation must equal scikit-image's Sobel of the blurred luma. The labels must equal scikit-image's watershed from the h-minima markers, as a partition. Two minima that tie at the lowest level, with a shallow pass between them, must give one marker, while a deep basin behind a ridge still gives its own. On the noisy Disks image with h of 20, the filter must find 7 regions. The representation must have its three stages.

--8<-- "filters/watershed-tests.md"

## References

--8<-- "filters/watershed-references.md"
