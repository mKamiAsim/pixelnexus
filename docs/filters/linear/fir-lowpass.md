# Low-pass FIR filter

--8<-- "filters/fir-lowpass-facts.md"

## Overview

The low-pass FIR filter keeps patterns coarser than a cutoff frequency and removes finer ones. Its taps come from the window method, the classic way to design a finite impulse response (FIR) filter. You set the cutoff in cycles per pixel, the number of taps, and the window that shapes the taps.

<figure markdown="span">
  ![A line plot across a sharp edge after low-pass filtering with 31 taps and cutoff 0.08. The Hamming curve dips and overshoots a little more beside the edge than the Blackman curve.](../../assets/figures/fir-lowpass-light.svg#only-light){ width="480" }
  ![A line plot across a sharp edge after low-pass filtering with 31 taps and cutoff 0.08. The Hamming curve dips and overshoots a little more beside the edge than the Blackman curve.](../../assets/figures/fir-lowpass-dark.svg#only-dark){ width="480" }
  <figcaption>Near a sharp edge, Hamming taps ring a little more than Blackman taps.</figcaption>
</figure>

## How it works

1. Start from the perfect low-pass filter. Its taps follow a sinc wave that never ends.
2. Cut the wave to the chosen number of taps and taper its ends with a window.
3. Divide the taps by their sum, so flat areas keep their value.
4. Filter every row with the taps, then every column.

## Mathematical foundation

--8<-- "filters/fir-lowpass-formula.md"

The windows are the symmetric ones that `scipy.signal.get_window` gives, for \(n\) from 0 to \(N - 1\):

\[
\begin{aligned}
w_{\text{Hamming}}[n] &= 0.54 - 0.46 \cos\frac{2\pi n}{N-1}, \\
w_{\text{Hann}}[n] &= 0.5 - 0.5 \cos\frac{2\pi n}{N-1}, \\
w_{\text{Blackman}}[n] &= 0.42 - 0.5 \cos\frac{2\pi n}{N-1} + 0.08 \cos\frac{4\pi n}{N-1}, \\
w_{\text{Kaiser}}[n] &= \frac{I_0\!\left(\beta \sqrt{1 - \left(\frac{2n}{N-1} - 1\right)^2}\right)}{I_0(\beta)}
\end{aligned}
\]

where \(N\) is the number of taps, \(\beta\) the Kaiser shape and \(I_0\) the modified Bessel function of the first kind of order 0. These are mathematical definitions. The code computes \(I_0\) from its power series.

The ideal sinc taps have a perfect cutoff but infinite length. Cutting them off sharply makes ripples near the cutoff, the Gibbs phenomenon. A window trades a slower transition for smaller ripples. Hamming has a narrow transition and moderate leakage. Blackman leaks less but changes more slowly. Kaiser lets you choose with \(\beta\). In the image, the ripples show as ringing: light and dark bands parallel to sharp edges.

## Kernel or operator

The 1D taps for 9 taps, cutoff 0.2 and the Hamming window, from the filter code.

--8<-- "kernels/fir-lowpass.md"

## Algorithm

--8<-- "filters/fir-lowpass-steps.md"

## Parameters

--8<-- "filters/fir-lowpass-params.md"

## Implementation

`firTaps` in `web/src/core/filters/linear/fir-lowpass.ts` builds the taps. The filter runs as two 1D passes with the shared correlation code. Some taps are negative, so alpha weighting, which needs positive weights, is off. Results past 0 or 255 are clipped.

## Worked example

--8<-- "examples/fir-lowpass.md"

## Complexity

--8<-- "filters/fir-lowpass-complexity.md"

## Artifacts and limitations

--8<-- "filters/fir-lowpass-limits.md"

## Tests

The reference taps come from `scipy.signal.firwin` with the cutoff given relative to the Nyquist frequency, for all four windows. The test compares the taps to 6 decimals and the filtered output with `scipy.ndimage.correlate1d` along both axes, for all five border modes.

--8<-- "filters/fir-lowpass-tests.md"

## References

--8<-- "filters/fir-lowpass-references.md"
