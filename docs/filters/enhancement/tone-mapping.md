# Tone mapping

--8<-- "filters/tone-mapping-facts.md"

## Overview

Tone mapping compresses a wide range of brightness into the range a screen can show. This filter offers three classic operators from OpenCV. Reinhard and Devlin model the photoreceptors of the eye. Drago et al. use an adaptive logarithm. Mantiuk et al. compress contrast in the gradient domain. An ordinary 8-bit image has a small range already, so here the operators mostly reshape the tone curve and the local contrast. The filter runs in the PixelNexus engine.

<figure markdown="span">
  ![Four panels. The input has a dark left half with three faint squares, a gray ramp in the middle and a light right half with three faint squares. With Reinhard, Drago and Mantiuk, the dark ground turns black and its squares become clear gray squares. The light ground turns almost white, and its squares almost vanish.](../../assets/figures/tone-mapping-light.svg#only-light){ width="480" }
  ![Four panels. The input has a dark left half with three faint squares, a gray ramp in the middle and a light right half with three faint squares. With Reinhard, Drago and Mantiuk, the dark ground turns black and its squares become clear gray squares. The light ground turns almost white, and its squares almost vanish.](../../assets/figures/tone-mapping-dark.svg#only-dark){ width="480" }
  <figcaption>A dark half and a bright half, each with squares 10 levels apart, and a ramp between. Then the Reinhard, Drago and Mantiuk operators with their defaults.</figcaption>
</figure>

## How it works

--8<-- "filters/tone-mapping-steps.md"

## Mathematical foundation

--8<-- "filters/tone-mapping-formula.md"

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/tone-mapping-params.md"

## Implementation

`tone_mapping` in `engine/src/pixelnexus_engine/filters/tone.py` decodes the 8-bit values with the sRGB curve, since the operators expect linear light. It passes the image to OpenCV in BGR order as float32, and scales the result from 0 to 1 back to 8 bits. OpenCV's operators end by stretching their result from its minimum to its maximum and raising it to 1 / gamma, as its source shows.

## Worked example

--8<-- "examples/tone-mapping.md"

All three operators spread the dark squares apart, from a step of 10 to one of 88 to 106. The bright squares nearly vanish, with a step of 2 to 5. On linear light the dark values are small, and each operator lifts them most. The final stretch then sends the darkest ground to black or almost black.

## Complexity

--8<-- "filters/tone-mapping-complexity.md"

## Artifacts and limitations

--8<-- "filters/tone-mapping-limits.md"

## Tests

The sRGB curve must match its formula. Each operator must equal OpenCV's own call on the decoded image, and the alpha must stay. Each representation must have its three stages.

--8<-- "filters/tone-mapping-tests.md"

## References

--8<-- "filters/tone-mapping-references.md"
