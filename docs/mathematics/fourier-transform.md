# Fourier transform

The discrete Fourier transform (DFT) writes an image as a sum of complex waves. This page gives the definition PixelNexus uses and the steps around it.

## Definition

For a plane \(I\) of width \(W\) and height \(H\):

\[
F(u, v) = \sum_{y=0}^{H-1} \sum_{x=0}^{W-1} I(x, y)\, e^{-2\pi i \left(\frac{u x}{W} + \frac{v y}{H}\right)}
\]

and back:

\[
I(x, y) = \frac{1}{W H} \sum_{v=0}^{H-1} \sum_{u=0}^{W-1} F(u, v)\, e^{2\pi i \left(\frac{u x}{W} + \frac{v y}{H}\right)}
\]

This is the convention of `numpy.fft.fft2`. The index \(u\) belongs to the frequency \(u / W\) cycles per pixel, read as \(u / W - 1\) for \(u \ge W/2\), as `numpy.fft.fftfreq` does.

- \(|F(u, v)|\) is the **magnitude**: how strong that wave is.
- \(\arg F(u, v)\) is the **phase**: where the wave sits.

For real images \(F(-u, -v) = \overline{F(u, v)}\), so the spectrum is symmetric about its center.

## The fast transform

Computed directly, the DFT costs \(O(N^2)\) for \(N\) pixels. The fast Fourier transform (FFT) costs \(O(N \log N)\). PixelNexus has its own FFT for any length (`web/src/core/math/fft.ts`):

- Lengths whose only prime factors are 2, 3 and 5 use a mixed-radix Stockham transform.
- Other lengths use Bluestein's algorithm, which turns the transform into a convolution of power-of-2 length.

A 2D transform is a 1D transform of every row, then of every column.

## Padding before filtering

The DFT treats the image as if it repeated forever, so the left edge touches the right edge. Filtering would then mix opposite edges. The frequency filters therefore extend the plane first:

1. Extend it by half its size on each side, at most 256 pixels, with the chosen border mode. This is the padding step of Gonzalez and Woods, with the border mode in place of zeros.
2. Add a few more pixels on the right and at the bottom to reach a size the FFT handles fast.
3. Transform, multiply by the filter's response \(H(f_x, f_y)\), transform back.
4. Crop to the image.

## The Spectrum panel

The panel shows \(\ln(1 + |F|)\) of the brightness of the center part of the image, at most 512 pixels on a side, with frequency 0 moved to the center. The logarithm is needed because the value at frequency 0, the sum of the image, is far larger than the rest. The panel multiplies the image by a window before the transform, so the image edges do not draw bright lines through the spectrum.

## See also

- [Spatial and frequency domains](spatial-and-frequency-domains.md)
- [Wavelet transforms](wavelet-transforms.md), which describe both where and how fast.
