# Subject and background

## Subject selection

--8<-- "tools/subject-heuristic-facts.md"

## Background selection

--8<-- "tools/background-heuristic-facts.md"

## Overview

**Select > Subject** guesses the main object of the image. **Select > Background** selects everything else. Both work without AI, from color, detail and position. They give a starting point that you fix with the other tools. AI selection is planned for a later phase.

## How to use them

1. Open an image with one clear object.
2. Choose **Select > Subject** or **Select > Background**. The work runs in the background and takes about a second.
3. Fix mistakes with the selection brush, the eraser or Quick Selection.

## How it works

Subject:

--8<-- "tools/subject-heuristic-steps.md"

Background:

--8<-- "tools/background-heuristic-steps.md"

## Mathematical foundation

Everything below runs on a copy of at most 512 pixels on the longer side, made by averaging.

**Frequency-tuned saliency** (Achanta et al., 2009) is

\[
S_{\text{ft}}(p) = \lVert I_\mu - I_{\omega}(p) \rVert
\]

where \(I_\mu\) is the mean CIELAB color of the image, \(I_\omega\) the image after a small blur, and the norm the CIELAB distance. PixelNexus blurs with the 5x5 binomial kernel. Pixels whose color differs from the image average stand out.

**Spectral residual** (Hou and Zhang, 2007) works on a 64x64 gray copy. With \(A\) the log amplitude and \(P\) the phase of its Fourier transform,

\[
R = A - h_3 * A, \qquad S_{\text{sr}} = \big| \mathcal{F}^{-1}\!\left(e^{R + iP}\right) \big|^2
\]

where \(h_3 * A\) is the 3x3 mean of \(A\), with the spectrum wrapping around. The parts of the spectrum that are not typical for images mark unusual places. PixelNexus smooths \(S_{\text{sr}}\) with a Gaussian of sigma 2.5 pixels at the 64x64 size.

The rest is PixelNexus's own heuristic:

1. **Edge density** is the Sobel gradient of luma, averaged over a box 1/8 of the longer side wide.
2. **Center prior** is \(\exp\!\big(-(u^2 + v^2) / (2 \cdot 0.5^2)\big)\), with \(u\) and \(v\) from -1 to 1 across the image.
3. The saliency is \(0.4\, S_{\text{ft}} + 0.3\, S_{\text{sr}} + 0.3\,\) edge density, scaled to 0 to 1, times \(0.4 + 0.6 \times\) center prior, scaled again.
4. k-means with 8 clusters groups the colors. Each cluster scores its mean saliency times \(1 - b\), where \(b\) is its share of a frame 2% wide along the image border. The background usually touches the border all around.
5. Each pixel scores the mean of its saliency and its cluster score. Otsu's threshold splits the scores into two classes.
6. The connected part with the largest summed score stays. So does every part with at least half that score and at least 0.5% of the image. Holes inside are filled.
7. The mask is scaled up with bilinear interpolation and snapped to edges, with a reach of 1.5 times the scale factor, from 2 to 24 pixels.

Background selection is the inverse: each value becomes 255 minus the value.

## Implementation

The work runs in a Web Worker, so the studio stays responsive. On a 512 x 512 test image it took about one second on the development PC.

## Limitations

- A busy background, or a subject that is not colorful or detailed, fools it.
- It keeps the main object. Several objects of the same size may be kept or dropped by the score rule in step 6.
- It is a heuristic. Its weights are choices, not results from a paper.

## Tests

--8<-- "tools/subject-heuristic-tests.md"

## References

--8<-- "tools/subject-heuristic-references.md"
