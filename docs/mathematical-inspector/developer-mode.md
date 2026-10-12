# Developer mode

The Developer panel shows how the selected filter is built and how its last run went. It is for people who want to read the code, check the numbers or reproduce a result in Python.

Open it from **Window > Developer**, or choose the **Developer** workspace.

## Sections

| Section | What it shows |
|---|---|
| Current configuration | The filter id and the validated parameters as JSON. |
| Code | Links to the filter code, the function that builds the operator and the shared framework, on GitHub. Browser filters use no outside libraries. |
| Data types and conversions | The input and output types, the float planes inside, the channel scope, linear light, the rounding and the support radius for the current values. |
| Timing and memory | The last preview or Apply: total time, filter time inside the workers, strips and workers. Also the memory a full run on the active image needs, and the budget on this device. |
| Warnings | Messages for the current values, for example when linear light cannot be used. |
| Numeric example | A small window of real pixel values from the active image, the kernel and the result, computed by the filter code. For Sobel it uses the horizontal kernel. |
| Tests | The test files of the filter, with links. |
| Formula source | The formula as LaTeX, before the values are filled in. |
| Parameter schema | The parameter definitions from the catalog. |
| Filter definition | The whole catalog entry as JSON. |

The last four sections start closed, because they are long.

## Reading the timing

The timing describes one run on this device. It changes with the image, the browser, other open tabs and the hardware. It is not a benchmark. The docs quote speed only from recorded benchmarks with the date and the machine.

## Reproduce a result in Python

1. Copy the parameters JSON from **Current configuration**.
2. Copy the kernel from the Inspector with the **NumPy** button.
3. Read the border mode and the channel scope from the JSON.
4. Apply the kernel by correlation, for example with `scipy.ndimage.correlate`, using the same border mode.

The fixture tests in the repository do the same thing for every filter. They compare the studio with SciPy, NumPy, scikit-image and OpenCV. See the Tests section of each filter page.
