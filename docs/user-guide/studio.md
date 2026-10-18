# The studio

The PixelNexus studio is the app itself. It runs in your web browser, and your images never leave your computer. You open an image, apply filters to all of it or to a selection, and see the mathematics behind every result.

The studio is built for study. Each filter comes with its formula, its kernel or operator, plain explanations and live demos on your own image. It also works for everyday photo edits.

## Open the studio

| Where | How |
|---|---|
| Online | Open <https://mkamiasim.github.io/pixelnexus/studio/>. Nothing to install. |
| On your computer | Run `pnpm dev` and open <http://localhost:5173>. See [Installation](../getting-started/installation.md). |
| With Docker | Run `docker compose up --build` and open <http://localhost:8080>. |

You can install the studio as an app from the browser menu. After the first visit it also opens without a network connection.

Most filters run in the browser. Some advanced ones need the PixelNexus engine, a small Python server on your computer. The status bar shows "Local engine: on" when it runs. See [Installation](../getting-started/installation.md) to start it.

## A first session

1. Open an image. Drop a file on the window, press Ctrl+O, or click a test image on the start screen.
2. Find a filter in the **Library** panel. Type part of its name, such as "gaussian".
3. Click the filter. Its settings open in the **Properties** panel.
4. Turn on **Preview** to see the result live while you change a setting.
5. Click **Apply**, or press Ctrl+Enter. The step joins the **History**.
6. Press Ctrl+Z to undo it, or click any step in the History panel to go back to it.
7. Export the result with **File > Export**.

Press Ctrl+K at any time to find a command by name. The [workspace](workspace.md) page explains the window in more detail.

## Study with the studio

The studio shows how a filter works, not only what it does. These steps get the most out of it.

### Set up the Study workspace

Choose **Workspace: Study** in the box at the top right of the window. The Learn and Inspector panels get the most room, with Info and Histogram next to them. You can move any panel later, and **Window > Reset workspace** brings the layout back.

### Start with a test image

The start screen has test images made for learning. Each one shows a filter's behavior more clearly than a photo does.

| Test image | Good for |
|---|---|
| Step edge | How a filter treats one sharp edge: blur, ringing, edge detection. |
| Gray ramp | Point operations such as gamma and contrast, and banding. |
| Checkerboard | Corners, aliasing and geometric changes. |
| Zone plate | Frequency: which ring frequencies a filter keeps or removes. |
| Siemens star | Fine detail at every direction, and where it gets lost. |
| Disks and dots | Morphology, thresholds and segmentation. |
| Noise patches | Noise reduction, with clean, Gaussian, salt-and-pepper and speckle parts. |
| Hue sweep | Color filters and color spaces. |
| Soft alpha disk | Transparency and soft edges. |

### Read the Learn panel

The [Learn panel](learn-panel.md) explains the selected filter in plain words, then runs demos on your image. Switch between **Basic**, without formulas, and **Academic**, with the formula and your current values.

The demos look at one pixel. Choose the Probe tool (I) and click the image to pick that pixel. For example, the neighborhood stepper shows the window of values around it, the kernel, each value times its weight, and the sum. The sum equals what **Apply** writes at that pixel.

### Watch the Inspector

The [Inspector](../mathematical-inspector/overview.md) shows the formula, the symbols, the kernel or operator, the algorithm and the limits of the selected filter. Every number comes from the code that runs, with your current values.

Change a setting in Properties, such as the sigma of the Gaussian filter, and watch the kernel in the Inspector change with it. A test checks that the kernel it shows is the kernel that runs.

### Compare and measure

- Hold the backslash key (\\) to see the original for a moment, or use the compare modes below the image.
- The **Histogram** and **Info** panels show how the values change.
- The **Metrics** panel measures PSNR, SSIM, MSE and MAE against the original. See [Metrics](metrics.md).
- The **Spectrum** panel shows the Fourier transform of the image, for the frequency filters.
- The **Compare grid** runs one filter at several values side by side, so you see the effect of one setting. See [Compare grid](compare-grid.md).

### Go deeper in these docs

Each filter has a page in these docs with its formula, a worked example with real numbers, its complexity, its limits and the tests that check it. The last section of the Learn panel links to it. The [Mathematics](../mathematics/foundations.md) section explains the ideas that many filters share.

## Study paths

Each path builds on the one before it. Apply a filter, look, undo, and try the next.

| Topic | Test image | Filters, in order |
|---|---|---|
| Smoothing | Noise patches | [Box filter](../filters/linear/box.md), [Gaussian filter](../filters/linear/gaussian.md), [Median filter](../filters/nonlinear/median.md), [Bilateral filter](../filters/nonlinear/bilateral.md) |
| Edges | Step edge, then Siemens star | [Sobel](../filters/edges/sobel.md), [Laplacian](../filters/linear/laplacian.md), [Canny](../filters/edges/canny.md) |
| Sharpening | Step edge | [Gaussian filter](../filters/linear/gaussian.md), then [Unsharp mask](../filters/linear/unsharp-mask.md) |
| Frequency | Zone plate | [Ideal low-pass](../filters/frequency/ideal-lowpass.md), then [Gaussian low-pass](../filters/frequency/gaussian-lowpass.md), with the Spectrum panel open |
| Morphology | Disks and dots | [Erosion](../filters/morphology/erosion.md), then [Opening](../filters/morphology/opening.md) |
| Noise | Gray ramp | [Add Gaussian noise](../filters/utility/noise-gaussian.md), then a smoothing filter, with the Metrics panel |

Some questions to ask on each path:

- What happens to a flat area? To an edge? To one bright pixel?
- Which setting matters most, and what does doubling it do?
- Where does the filter fail? The page of each filter lists its artifacts and limits.
