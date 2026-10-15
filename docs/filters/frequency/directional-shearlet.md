# Shearlet-inspired directional filter

--8<-- "filters/directional-shearlet-facts.md"

## Overview

The shearlet-inspired filter splits the spectrum of the image into smooth sheared tiles, in a horizontal and a vertical cone of directions, as cone-adapted shearlets do. In each tile it keeps the strong parts, which belong to lines and edges, and drops the weak ones, which are mostly noise. Or it keeps only the tiles of one direction. It borrows the shearlet tiling but not the shearlet transform itself, so it is called shearlet-inspired. The filter runs in the PixelNexus engine on your computer.

<figure markdown="span">
  ![Four panels: three thin bright lines crossing on a dark ground with strong grainy noise; the shearlet-inspired result, with clean lines and faint streaks along their directions; wavelet thresholding, with clean lines and a little blotchy grain; and only the diagonal line that falls from top left to bottom right, bright on a mid gray ground.](../../assets/figures/directional-shearlet-light.svg#only-light){ width="480" }
  ![Four panels: three thin bright lines crossing on a dark ground with strong grainy noise; the shearlet-inspired result, with clean lines and faint streaks along their directions; wavelet thresholding, with clean lines and a little blotchy grain; and only the diagonal line that falls from top left to bottom right, bright on a mid gray ground.](../../assets/figures/directional-shearlet-dark.svg#only-dark){ width="480" }
  <figcaption>Three lines with Gaussian noise of sigma 20, the shearlet-inspired filter with the defaults, and wavelet thresholding. The last panel keeps only the direction of the 135 degree line.</figcaption>
</figure>

## How it works

1. Extend the channel with the border mode and take its FFT.
2. Cut the spectrum into smooth tiles: octave bands of frequency, each cut by slope into sheared tiles, in a horizontal and a vertical cone.
3. To remove noise, turn each tile back into an image, set its weak values to zero, and put all tiles back together.
4. To keep one direction, keep only the tiles near that direction, and the coarse tile if you ask for it.
5. Cut the result back to the image.

## Mathematical foundation

--8<-- "filters/directional-shearlet-formula.md"

Shearlets, after Guo and Labate, reach the same goal as curvelets with a different tool. Instead of rotating, they shear: a tile is moved along the slope f_y / f_x, which keeps every operation on the square grid of the image. A cone-adapted system uses one cone for the mostly horizontal frequencies and one for the mostly vertical ones, so the slope never grows past 1. The directions are evenly spaced in slope, not in angle, so they lie closer together near the axes. Here the tiles of the two cones that meet at a diagonal are joined, so that no tile has an edge there. The windows use Meyer's polynomial nu, which makes every transition smooth.

The masks form what is called a tight frame. Their squares add up to 1 at every frequency, so filtering with each mask twice, once to get the tile and once to put it back, returns the image exactly. Thresholding then works as in wavelet thresholding. For white noise of standard deviation sigma, Parseval's theorem gives the noise of tile t as sigma times the root mean square of its mask. Coefficients below k times that value are set to zero. Long lines and edges fall into few tiles, with large values, so they survive. Noise spreads evenly over all tiles and is removed.

## Kernel or operator

To remove noise, the Inspector asks the engine for the stages with the current settings: the spectrum, the tiles, the tile coefficients, the threshold and the synthesis. To keep one direction, it shows the response, the sum of the squared masks of the kept tiles, as a picture of the spectrum and a profile.

## Algorithm

--8<-- "filters/directional-shearlet-steps.md"

## Parameters

--8<-- "filters/directional-shearlet-params.md"

## Implementation

`directional_shearlet` in `engine/src/pixelnexus_engine/filters/directional.py` runs `directional_plane` on each channel the scope names. `shearlet_tiles` builds the masks on the half spectrum of `scipy.fft.rfft2`. It uses the radial bands of `radial_bands` and the slope windows of `slope_windows`. `symmetric_nyquist` makes the masks agree at opposite frequencies on the last column, so the results stay real. The noise of each tile comes from `tile_rms`. Without the coarse part, the kept detail is shown around a mid gray of 128. There is no live preview. The result arrives when you click Apply.

## Worked example

--8<-- "examples/directional-shearlet.md"

## Complexity

--8<-- "filters/directional-shearlet-complexity.md"

## Artifacts and limitations

--8<-- "filters/directional-shearlet-limits.md"

## Tests

The tests check that Meyer's polynomial satisfies nu(x) + nu(1 - x) = 1. The squares of the masks must add up to 1 to within 10^-12, for 2 and 4 scales, 8 and 32 directions, and even and odd sizes. With a threshold factor of 0, the image comes back to within 10^-9 for three border modes. Stripes at 0, 45, 90 and 135 degrees are kept when the line angle matches and removed when it is 90 degrees off. The noise of the tile coefficients of white noise matches sigma times the RMS of the mask. Removing noise from lines raises the PSNR by more than 5 dB. The engine API tests run jobs and check both kinds of representation.

--8<-- "filters/directional-shearlet-tests.md"

## References

--8<-- "filters/directional-shearlet-references.md"
