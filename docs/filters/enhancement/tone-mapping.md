# Tone mapping

--8<-- "filters/tone-mapping-facts.md"

## Overview

Tone mapping compresses a wide range of brightness into the range a screen can show. This filter offers three classic operators from OpenCV. Reinhard and Devlin model the photoreceptors of the eye. Drago et al. use an adaptive logarithm. Mantiuk et al. compress contrast in the gradient domain. An ordinary 8-bit image has a small range already, so here the operators mostly reshape the tone curve and the local contrast. The filter runs in the PixelNexus engine.

## How it works

--8<-- "filters/tone-mapping-steps.md"

## Mathematical foundation

--8<-- "filters/tone-mapping-formula.md"

## Kernel or operator

There is no fixed kernel. The Inspector asks the engine for the stages with the current settings.

## Parameters

--8<-- "filters/tone-mapping-params.md"

## Implementation

`tone_mapping` in `engine/src/pixelnexus_engine/filters/tone.py` decodes the 8-bit values with the sRGB curve, since the operators expect linear light. It passes the image to OpenCV in BGR order as float32, and scales the result from 0 to 1 back to 8 bits. OpenCV's operators end by stretching their result from its minimum to its maximum and raising it to 1 / gamma, as its source shows. A worked example and a figure are still to come.

## Complexity

--8<-- "filters/tone-mapping-complexity.md"

## Artifacts and limitations

--8<-- "filters/tone-mapping-limits.md"

## Tests

The sRGB curve must match its formula. Each operator must equal OpenCV's own call on the decoded image, and the alpha must stay. Each representation must have its three stages.

--8<-- "filters/tone-mapping-tests.md"

## References

--8<-- "filters/tone-mapping-references.md"
