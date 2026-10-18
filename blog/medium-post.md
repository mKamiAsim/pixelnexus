# PixelNexus: an image processing studio that shows its maths

Most photo editors hide how a filter works. You move a slider and the picture changes. That is fine for editing. It does not help a student who wants to know why a Sobel filter finds edges, or a developer who must reproduce a result in Python.

PixelNexus is a free image processing studio that runs in your web browser. It has close to 300 classical filters and selection tools in the style of Photoshop. Every filter also shows its formula, its kernel, its steps and its limits. The numbers you see are the numbers the code uses.

![The PixelNexus start screen with nine test images: step edge, gray ramp, checkerboard, zone plate, Siemens star, disks and dots, noise patches, hue sweep and a soft alpha disk.](images/start-screen.png)

## Why I built it

I wanted one place where a student can apply a filter and see the mathematics at the same moment. Textbooks show the formula. Libraries such as OpenCV run the code. Neither shows both at once, on your own image, with your own settings.

PixelNexus has three goals:

- Teach image processing with live, honest examples.
- Give developers the exact kernel, parameters and data types of each run.
- Work as a normal photo editor for everyday tasks.

Your images never leave your computer. The filters run in the browser, and the studio also works offline after the first visit.

## How it works

The studio has two engines. Each filter runs in exactly one of them.

- **The browser engine.** 207 filters are written in TypeScript and run in Web Workers. They need no install and no server.
- **The local engine.** 89 advanced filters need Python libraries such as SciPy, scikit-image or OpenCV. A small Python server runs them on your own computer. The studio finds it and shows "Local engine: on".

Neural network models are always optional. They run through ONNX Runtime, and you download each model only when you want it.

One catalog drives everything. It is a set of YAML files, one per filter. Each file holds the filter's name, parameters, formula, explanations, references and the tests that check it. The studio, the Python engine, the documentation and the test tools all read the same files. A formula cannot say one thing in the docs and another in the code.

Each filter is checked against a reference library. The tests compare the studio's output with SciPy, NumPy, scikit-image and OpenCV on fixed test images. Today about 3,800 web tests and over 900 Python tests run on every change.

## Three ways to use the studio

The workspace box at the top right switches the layout. Three layouts matter most.

### Essentials, for editing

The Library on the left lists every filter by family. Properties on the right holds the settings. History and Undo work as in any editor. You can apply a filter to the whole image or only to a selection.

![The Library panel lists the filter families, each with a count, next to the noise patches test image.](images/library.png)

### Study mode, for students

The Study workspace gives most of the room to two panels: **Learn** and **Inspector**.

The **Learn** panel explains the selected filter in plain words. It has two levels. **Basic** has no formulas. **Academic** adds the formula with your current values. Under the explanation it runs small demos on one pixel of your image. You choose that pixel with the Probe tool.

For Sobel, the demo is a gradient explorer. It shows the 3x3 window of brightness values around the pixel, the horizontal change Gx, the vertical change Gy, the edge strength and its direction as an arrow. Move the probe across an edge and watch the arrow turn.

![The Study workspace with the Siemens star after Sobel. The Learn panel explains Sobel in four steps and shows the gradient explorer at one pixel.](images/study-learn-sobel.png)

### Developer mode, for engineers

The Developer workspace adds the **Developer** panel. It shows:

- The current configuration as JSON, ready to copy.
- Links to the filter code and to the function that builds its kernel.
- The data types inside the filter: 8-bit input, 32-bit float planes, the channel used and the border mode.
- The timing of the last run and the memory a full run needs.
- A numeric example with real pixel values from your image.
- The test files that check the filter.

With the JSON and the kernel, you can reproduce any result in a few lines of Python.

![The Developer workspace after Sobel on the step edge. The Developer panel shows the JSON configuration, code links and data types. History shows the Sobel step.](images/developer-sobel.png)

## The Inspector panel

The Inspector shows the mathematics of the selected filter. It has seven tabs.

| Tab | What it shows |
|---|---|
| Overview | The purpose, a small before and after example, and facts such as linearity, border handling and the engine. |
| Formula | The formula with your current values, a table of symbols and a plain explanation. |
| Operator | The kernel, window or curve that the filter uses. |
| Parameters | Each setting with its meaning, effect, default and range. |
| Algorithm | The steps of the computation. |
| Limits | Time and memory cost, known artifacts, strengths and use cases. |
| References | The papers, books and library docs the filter follows. |

Every formula carries one of four labels:

- **Exact computation.** The studio computes it value for value.
- **Mathematical definition.** The textbook form, which the code computes in a discrete way.
- **Approximation.** The code approximates it, for example with a truncated kernel.
- **Simplified explanation.** A picture that helps understanding, but not what the code computes.

Students know at once how far to trust each formula.

The Inspector follows your settings. Change the sigma of a Gaussian filter in Properties, and the kernel in the Operator tab changes with it. A test checks that the kernel the Inspector shows is the kernel that runs. Copy buttons give you the formula as LaTeX and each kernel as a NumPy array.

![The Inspector's Formula tab for Sobel. It shows Gx and Gy as correlations with the kernels, the magnitude and direction formulas, a table of symbols and a short explanation.](images/inspector-formula-sobel.png)

## A real example: edge detection with Sobel

Edges are places where brightness changes fast. The Sobel filter measures that change at each pixel.

1. Open the **Step edge** test image from the start screen. It is dark on the left and bright on the right.
2. Type "sobel" in the Library and click **Sobel**.
3. Click **Apply**. A single bright line appears where the two halves meet. Everything else turns black, because flat areas have no change.

Now open the Inspector and choose the **Operator** tab. It shows the horizontal kernel Kx:

```text
-1  0  1
-2  0  2
-1  0  1
```

The kernel subtracts the left column from the right column. The middle row counts twice, which smooths the result along the edge. The weights sum to 0, so a flat area gives 0.

![The Inspector's Operator tab for Sobel. It shows the 3x3 kernel Kx, its size, the sum of weights 0 and that it splits into a column of 1, 2, 1 times a row of -1, 0, 1.](images/inspector-operator-sobel.png)

The docs work through one window with real numbers from the code. Take a window on a vertical edge, with value 20 on the left and 200 on the right:

```text
20  20  200
20  20  200
20  20  200
```

- Gx = (200 - 20) x (1 + 2 + 1) = 720.
- Gy = 0, because the top and bottom rows are equal.
- The magnitude is 720, and the direction is 0 degrees, pointing from dark to bright.

The studio then maps the magnitudes to the 0 to 255 range for display. The Learn panel's gradient explorer shows the same steps at any pixel you pick.

What a student learns here: an edge detector is a weighted difference. The kernel weights decide which direction it sees. Next, try **Canny**, which thins these thick responses to one-pixel lines and links them.

## A second example: sharpening with Unsharp mask

Unsharp mask is the classic way to sharpen a photo. It has three steps:

1. Blur a copy of the image with a Gaussian.
2. Subtract the blur from the image. What is left is the fine detail.
3. Add the detail back, multiplied by the amount.

The docs show it on one row of a soft edge, with sigma 1 and amount 1. The values come from the filter code:

| Position | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|
| Input | 40 | 70 | 150 | 200 | 215 |
| Result | 26 | 52 | 160 | 215 | 223 |

The dark side dips below its old value, and the bright side rises above it. These overshoots make the edge look sharper. Too much amount turns them into visible halos. The Limits tab warns about that.

With threshold 0, Unsharp mask is linear, so the Inspector can show it as one kernel. The center weight is large and positive, and the ring around it is negative.

![The Inspector's Operator tab for Unsharp mask, showing the large kernel with a positive center and small negative weights around it. The canvas shows the sharpened step edge.](images/inspector-unsharp-mask.png)

## The filter library

The catalog holds 297 filters in 14 families, plus 20 selection tools. Here are five from each family.

| Family | Filters | Five examples |
|---|--:|---|
| Linear spatial filters | 19 | Box, Gaussian, Laplacian of Gaussian, Unsharp mask, Gabor |
| Nonlinear spatial filters | 29 | Median, Bilateral, Anisotropic diffusion, Kuwahara, Non-local means |
| Adaptive and statistical filters | 22 | Lee, Frost, Kuan, Kalman, 2D LMS adaptive filter |
| Morphological filters | 26 | Erosion, Dilation, Opening, Closing, Top-hat |
| Frequency-domain filters | 23 | Ideal low-pass, Gaussian low-pass, Butterworth high-pass, Homomorphic, Notch reject |
| Wavelet and multiscale filters | 10 | Gaussian pyramid, Laplacian pyramid, Scale-space, Wavelet thresholding, Multiresolution diffusion |
| Edge detection and boundary analysis | 19 | Sobel, Prewitt, Scharr, Canny, Marr-Hildreth |
| Texture, corners, blobs and features | 28 | Harris, Shi-Tomasi, FAST, Gabor filter bank, Laws' texture energy |
| Enhancement, illumination and color | 32 | CLAHE, Contrast stretching, Gamma correction, White balance, Multi-scale retinex |
| Restoration and reconstruction | 22 | Wiener deconvolution, Richardson-Lucy, Inverse filtering, Tikhonov, Landweber |
| Segmentation and regions | 25 | Otsu, Sauvola, Region growing, K-means color, Watershed |
| Deep learning and learned processing | 10 | DnCNN, FFDNet, SwinIR, Restormer, Real-ESRGAN |
| Artistic and geometric effects | 21 | Oil painting, Pencil sketch, Cartoon, Halftone, Fisheye |
| Utilities | 11 | Add Gaussian noise, Quality metrics, Resize, Crop, Rotate and flip |

The selection tools include the marquee, lasso, magnetic lasso, Magic Wand, Quick Selection and an optional AI click select.

## Other features

- **Selections.** Apply any filter inside a selection. The studio blends the result at the edge without seams.
- **Test images.** Nine images made for learning: a step edge, a zone plate, a Siemens star, noise patches and more.
- **Compare.** Hold the backslash key to see the original, or use split and side-by-side views.
- **Compare grid.** Run one filter at several values side by side.
- **Metrics.** PSNR, SSIM, MSE and MAE against the original.
- **Histogram and Spectrum.** See how the values and the Fourier spectrum change.
- **Pipelines.** Save a chain of filters and run it again on other images.
- **Projects.** Save your images, history and selections in one file.
- **Offline use.** Install the studio as an app from the browser menu.

## How it helps students and developers

For students:

- You see the formula and the result side by side, on your own image.
- Each step is visible. The Learn demos show the window, the weights and the sum for one pixel.
- The labels tell you when a formula is exact and when it is a simplified picture.
- Study paths lead from basic filters to harder ones, for example Box, then Gaussian, Median and Bilateral.

For developers:

- The JSON and the NumPy kernel let you reproduce a result in Python.
- The Developer panel lists data types, rounding and border modes. These details often explain why two libraries give different results.
- Each filter is tested against SciPy, scikit-image or OpenCV, so you can trust it as a reference.

## Sources

The filters follow published sources. Each filter's References tab lists its own. The two examples above use these:

- Sobel, I. and Feldman, G. A 3x3 isotropic gradient operator for image processing. Talk at the Stanford Artificial Intelligence Project, 1968.
- Gonzalez, R. C. and Woods, R. E. Digital Image Processing, 4th edition. Pearson, 2018. Chapters 3 and 10.
- OpenCV documentation, image filtering, Sobel: https://docs.opencv.org/4.x/d4/d86/group__imgproc__filter.html
- scikit-image documentation, `skimage.filters.unsharp_mask`: https://scikit-image.org/docs/stable/api/skimage.filters.html#skimage.filters.unsharp_mask

## Explore further

- Documentation: https://mkamiasim.github.io/pixelnexus/
- The studio online: https://mkamiasim.github.io/pixelnexus/studio/
- The studio guide, with study paths: https://mkamiasim.github.io/pixelnexus/user-guide/studio/

The documentation has one page for every filter, with its formula, a worked example with real numbers, its cost, its limits and the tests that check it.
