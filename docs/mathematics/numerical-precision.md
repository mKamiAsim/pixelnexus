# Numerical precision

Images are stored with 8 bits per channel, but filters compute with more precision inside. This page explains where values are rounded, where they are clipped, and how close the results are to the reference libraries.

## Floats inside, 8 bits outside

1. The framework copies each channel into a 32-bit float plane. The values stay from 0 to 255.
2. Sums inside kernels run in 64-bit floats and are stored as 32-bit floats.
3. The filter result can be any number, even negative or above 255.
4. At the end, each value is mapped to 8 bits once. Filters that keep the meaning of the values, such as blurs, clip to 0 to 255. Filters with signed results use the output mapping.
5. The value is rounded to the nearest whole number.

Rounding happens only at the end. Chaining two filters in one step would round once, while applying them one after the other rounds twice.

## Output mapping

Gradients and the Laplacian can be negative. The **output mapping** turns them into pixel values:

| Mapping | Rule |
|---|---|
| Absolute value | \(\lvert v \rvert\), then clip |
| Offset by 128 | \(v + 128\), then clip. 0 shows as middle gray. |
| Stretch to full range | \(255\,(v - v_{\min}) / (v_{\max} - v_{\min})\) |
| Clip to 0 to 255 | \(v\), clipped |

where \(v\) is the filter result, and \(v_{\min}\), \(v_{\max}\) are the smallest and largest results over the whole image.

Stretch to full range needs the whole result, so on large images it runs in two passes. First every tile reports its range. Then every tile maps its values with the joint range. A preview of only part of the image stretches with that part's range, so it can look a little different from the final result.

## Agreement with reference libraries

The tests compare the float results, before rounding, with SciPy, NumPy and scikit-image in 64-bit floats. They allow a difference of at most \(10^{-4}\) relative to the value, and at least \(10^{-4}\) in absolute terms. A 32-bit float holds about 7 decimal digits, so values near 2000, as in Sobel results, cannot be closer than about \(2 \times 10^{-4}\).

Integer results, such as the median, match exactly. Each filter page names its reference and its tolerance under Tests.

## Rounding

Values are rounded half up, as JavaScript's `Math.round` does. NumPy rounds halves to the nearest even number. The two differ only for results that end in exactly .5, and then by one level.
