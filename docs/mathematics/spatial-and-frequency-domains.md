# Spatial and frequency domains

An image can be described in two ways. In the **spatial domain** it is a grid of values, one per pixel. In the **frequency domain** it is a sum of waves: smooth areas are made of slow waves, and edges, fine texture and noise of fast ones. The [Fourier transform](fourier-transform.md) moves between the two without losing anything.

## Why both

Some filters are simpler to state in one domain than the other.

- A blur is a weighted average of neighbors in the spatial domain. In the frequency domain it is a low-pass filter: it keeps slow waves and weakens fast ones.
- Periodic noise, such as a scan pattern, is spread over the whole image in the spatial domain. In the frequency domain it is a few bright points, which a [notch reject](../filters/frequency/notch-reject.md) filter can remove.

## The convolution theorem

Convolution in the spatial domain is multiplication in the frequency domain:

\[
\mathcal{F}\{K * I\} = \mathcal{F}\{K\} \cdot \mathcal{F}\{I\}
\]

So every linear, shift-invariant filter has a **frequency response** \(H = \mathcal{F}\{K\}\): the factor by which it multiplies each wave. A Gaussian blur with standard deviation \(\sigma\) in pixels has the response \(e^{-2\pi^2 \sigma^2 (f_x^2 + f_y^2)}\), another Gaussian, wide where the kernel is narrow.

## Frequencies in PixelNexus

Frequencies are given in **cycles per pixel**, from \(-0.5\) to \(0.5\). A wave with frequency \(0.5\) changes sign from one pixel to the next, the fastest wave a grid can hold. Using cycles per pixel means a cutoff of 0.1 does the same thing on a small and a large image. The distance from the center of the spectrum is \(D = \sqrt{f_x^2 + f_y^2}\).

## Where you see it

- The **Spectrum** panel shows the log magnitude of the spectrum of the active image, with frequency 0 in the center, and tints the frequencies the selected filter removes.
- The [frequency filters](../filters/index.md) (ideal, Butterworth and Gaussian low-pass, high-pass, band-pass and band-reject, notch filters, homomorphic filtering) work in the frequency domain.
- The [Fourier transform](fourier-transform.md) page explains how the studio computes spectra.
