# Contourlet filtering

--8<-- "filters/contourlet-facts.md"

## Overview

Contourlet filtering removes noise while it keeps edges and lines in any direction. Wavelets split an image by size and into three directions only. A smooth edge then crosses many wavelet positions, and each needs its own large coefficient. Do and Vetterli built the contourlet transform to follow such contours with fewer coefficients. It splits the image by size with a Laplacian pyramid, then splits each size into many directions with a directional filter bank. An edge ends up in the few subbands that match its direction, while noise spreads over all of them. The filter sets the small coefficients to zero and puts the image back together. It runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: three thin bright lines crossing on a dark ground with strong grainy noise; contourlet filtering, with clean lines and short thin streaks in the flat areas; wavelet thresholding, with clean lines and a little blotchy grain; and a mid-gray panel that shows only the shallow line falling to the right, rebuilt from one directional wedge.](../../assets/figures/contourlet-light.svg#only-light){ width="480" }
  ![Four panels: three thin bright lines crossing on a dark ground with strong grainy noise; contourlet filtering, with clean lines and short thin streaks in the flat areas; wavelet thresholding, with clean lines and a little blotchy grain; and a mid-gray panel that shows only the shallow line falling to the right, rebuilt from one directional wedge.](../../assets/figures/contourlet-dark.svg#only-dark){ width="480" }
  <figcaption>One wedge of directions holds the shallow line and almost nothing of the two steep lines.</figcaption>
</figure>

## How it works

1. Blur and halve the image a few times. At each size, keep the detail the blur removed.
2. Split each detail image into directional subbands.
3. Estimate the noise level, and set the coefficients below the threshold of their subband to zero.
4. Run the directional split backward, and add the details back size by size.

## Mathematical foundation

--8<-- "filters/contourlet-formula.md"

The **Laplacian pyramid** of Burt and Adelson keeps, at each level, the difference between an image and its prediction from the next coarser level. Here the low-pass filters are the biorthogonal 9-7 filters of Cohen, Daubechies and Feauveau, as Do and Vetterli use them. Adding the prediction back undoes each level exactly, whatever the filters are.

The **directional filter bank** of Bamberger and Smith splits the frequency plane into wedges. Do and Vetterli build it as a tree of two-channel filter banks with quincunx sampling, which keeps every second pixel in a checkerboard pattern. The first bank splits the directions into edges closer to horizontal and edges closer to vertical. The second level splits each half again at 45 degrees. From the third level on, a shear in front of each bank turns its two fan-shaped halves into narrower wedges. With l levels, there are 2^l wedges. They have equal widths in slope, not in angle.

Each two-channel bank is a **ladder**, also called a lifting structure. With a0 the pixels of the even checkerboard and a1 the odd ones, it runs two steps:

$$
a_0 \leftarrow \tfrac{1}{2}\,(a_0 + B\,a_1), \qquad a_1 \leftarrow a_1 - B\,a_0
$$

where:

- $a_0$ and $a_1$ are the pixels of the two checkerboard cosets.
- $B$ is a filter that predicts one coset from its neighbors in the other.

This is an exact computation. Running the two steps backward with the same B rebuilds a0 and a1, whatever B is. B is the filter of Phoong, Kim, Vaidyanathan and Ansari. They design it from one 1-D filter beta, applied along both diagonals of the checkerboard. PixelNexus multiplies B by (-1) to the row index, which turns its diamond-shaped pass band into a fan. The filter beta has 12 taps, the six values of their Example 3.2, mirrored. The toolbox of Do and Vetterli calls this filter "pkva".

The transform is not orthogonal, and the pyramid makes 4/3 as many coefficients as pixels. So white noise has a different strength in each subband. The filter measures that strength once, on white noise with a fixed seed, and scales each threshold by it.

## Kernel or operator

The Inspector shows the stages with the current settings. The pyramid stage lists its 9 and 7 filter taps. The directional filter bank stage lists the six ladder values. Then come the threshold, the shrink rule and the rebuild.

## Algorithm

--8<-- "filters/contourlet-steps.md"

## Parameters

--8<-- "filters/contourlet-params.md"

## Implementation

`contourlet` in `engine/src/pixelnexus_engine/filters/contourlet.py` runs `contourlet_plane` on each channel the scope names. The 9-7 taps come from PyWavelets' `bior4.4` wavelet. The ladder values are copied from the paper of Phoong and his coauthors, and a test checks them. The functions `lp_dec` and `lp_rec` run the pyramid with `scipy.ndimage.correlate1d`. The functions `dfb_dec` and `dfb_rec` run the tree of ladder banks, with each filter applied by FFT on the whole band. The shrink rules come from wavelet thresholding, and the noise estimate from the curvelet-inspired filter.

Some choices are PixelNexus's own, not from the paper. Each subband stays on the grid of its band, with zeros off its sampling lattice, so no resampling to rectangles is needed. The function `plan` picks the shear of each bank from the geometry of its wedge. The image is extended symmetrically, and the directional filter bank wraps around that extension. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/contourlet.md"

On these two test images, wavelet thresholding with BayesShrink does better. The images are made of flat areas and a few edges, which wavelets handle well. The fourth panel of the figure shows what the directional split adds: one wedge alone holds the shallow line, and the two steep lines are almost gone.

## Complexity

--8<-- "filters/contourlet-complexity.md"

## Artifacts and limitations

--8<-- "filters/contourlet-limits.md"

## Tests

The tests check what follows from the definitions. The ladder values are the published ones, and each tap joins the two checkerboard cosets. The pyramid, the directional filter bank with 1 to 4 levels and the whole transform with 4, 8 and 16 directions rebuild random images to within 10^-9. Without thresholding, the filter returns the image unchanged. Each subband holds 1 / 2^l of the points, and the subbands do not overlap. A wave in the middle of each of the 8 wedges puts over 80 percent of its energy in that wedge. A line at 37 degrees lands in the subband whose wedge is centered at 36.9 degrees. The measured noise strengths agree with fresh noise to within 10 percent. On a noisy disk with a line, the PSNR rises by more than 3 dB, and the disk edge stays sharp.

--8<-- "filters/contourlet-tests.md"

## References

--8<-- "filters/contourlet-references.md"
