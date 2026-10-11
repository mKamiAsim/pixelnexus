# Task

Build a production-quality, browser-based image-processing web application called **PixelLab**.

The application must let a user:

1. Upload one or more images.
2. View and edit an image on an interactive canvas.
3. Select the whole image or a precise region/subject.
4. Apply image-processing filters to the selected area only.
5. Inspect the mathematical definition of every selected filter, including its formula, kernel matrix where applicable, parameters, complexity, assumptions, and limitations.
6. Undo/redo, compare before/after, and export the processed image.

Build this as a modern, responsive, accessible single-page web application.

# Technology Requirements

Use the following stack unless there is a strong technical reason to change it:

- Frontend: React 18+ with TypeScript
- Build tool: Vite
- UI: Tailwind CSS
- State management: Zustand or Redux Toolkit
- Canvas/image processing:
  - Native HTML5 Canvas and WebGL where appropriate
  - OpenCV.js for advanced classical image-processing operations
- Web Workers for CPU-heavy filter execution
- OffscreenCanvas where supported
- Testing: Vitest + React Testing Library
- Linting/formatting: ESLint + Prettier
- Package manager: pnpm

Do not use a backend for core image processing. All image editing must work locally in the browser. If optional server-side AI segmentation is included, it must be clearly separated behind an adapter interface and must not be required for the app to function.

# High-Level Architecture

Create a clean, modular architecture:

```text
src/
  app/                 # App shell, routing, global providers
  components/          # Reusable UI components
  features/
    upload/            # Image upload, drag-and-drop, validation
    canvas/            # Canvas viewport, zoom, pan, rendering
    selection/         # Selection tools and mask management
    filters/           # Filter registry, parameters, execution
    docs/              # Mathematical documentation panel
    history/           # Undo/redo and non-destructive edit stack
    export/            # Image export and download
  core/
    image/             # Image decoding, color-space conversion, pixel buffers
    selection/         # Selection masks, boolean operations, feathering
    filters/
      linear/
      nonlinear/
      morphological/
      frequency/
      restoration/
      segmentation/
      color/
      artistic/
    workers/           # Web Worker entry points
    math/              # Convolution, kernels, normalization, FFT utilities
  types/               # Shared TypeScript types
  utils/               # General helpers
```

# Core Data Model

Implement these core TypeScript types:

```ts
export type ImageId = string;

export interface Loadedimage {
  id: ImageId;
  name: string;
  width: number;
  height: number;
  originalImageData: ImageData;
  thumbnailDataUrl: string;
}

export type SelectionMask = {
  width: number;
  height: number;
  // 0 = not selected, 255 = fully selected.
  // Intermediate values represent soft/feathered selection.
  data: Uint8ClampedArray;
};

export type FilterCategory =
  | "smoothing"
  | "sharpening"
  | "edge"
  | "feature"
  | "morphological"
  | "frequency"
  | "adaptive"
  | "color"
  | "restoration"
  | "segmentation"
  | "artistic";

export interface FilterParameter {
  key: string;
  label: string;
  type: "number" | "integer" | "boolean" | "select" | "color";
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean | string;
  options?: { value: string; label: string }[];
  description: string;
}

export interface FilterDefinition {
  id: string;
  name: string;
  category: FilterCategory;
  type: "linear" | "nonlinear" | "algorithmic" | "frequency" | "morphological";
  description: string;
  parameters: FilterParameter[];
  supportsGrayscale: boolean;
  supportsColor: boolean;
  supportsSelection: boolean;
  kernel?: {
    rows: number[][];
    anchor?: { x: number; y: number };
    divisor?: number;
    offset?: number;
    normalized?: boolean;
  };
  formula: string; // LaTeX or KaTeX-compatible string
  pseudocode?: string;
  complexity: string;
  references?: string[];
  execute: (
    input: ImageData,
    mask: SelectionMask | null,
    params: Record<string, unknown>
  ) => Promise<ImageData> | ImageData;
}

export interface HistoryEntry {
  id: string;
  label: string;
  filterId?: string;
  parameters?: Record<string, unknown>;
  selectionSnapshot?: SelectionMask;
  beforeThumbnail: string;
  afterThumbnail: string;
  timestamp: number;
}
```

# Image Upload Requirements

Implement an upload area that supports:

- Drag-and-drop
- File picker
- Paste from clipboard
- Multiple image upload
- JPEG, PNG, WebP, BMP, and GIF first frame
- Maximum configurable upload size, default 30 MB
- Automatic conversion to an internal RGBA `ImageData` representation
- Image preview thumbnails
- Display of image name, dimensions, file size, and color mode
- Error handling for unsupported, corrupted, or oversized files
- Privacy notice: “Images are processed locally in your browser.”

# Canvas Requirements

Build a professional canvas workspace with:

- Zoom in, zoom out, fit to screen, 100% zoom
- Pan using spacebar drag, middle mouse drag, or two-finger trackpad gesture
- Pixel-accurate rendering
- Checkerboard background for transparency
- Rulers optional but preferred
- Before/after split view
- Side-by-side compare mode
- Toggle original image overlay
- Reset view
- Keyboard shortcuts:
  - `Ctrl/Cmd + Z`: Undo
  - `Ctrl/Cmd + Shift + Z`: Redo
  - `Ctrl/Cmd + 0`: Fit to screen
  - `Ctrl/Cmd + +`: Zoom in
  - `Ctrl/Cmd + -`: Zoom out
  - `Ctrl/Cmd + S`: Export image
  - `Ctrl/Cmd + D`: Deselect

# Selection System

This is a critical feature. Implement Photoshop-like selection tools that generate an editable `SelectionMask`.

## Required selection modes

| Tool | Behavior |
|---|---|
| Rectangle select | Drag to create a rectangular selection |
| Ellipse select | Drag to create an elliptical selection |
| Freehand lasso | Draw an arbitrary selection boundary |
| Polygonal lasso | Click points to create a polygon selection |
| Magic Wand | Click to select contiguous pixels with similar color |
| Color Range | Select all pixels globally similar to a sampled color |
| Quick Selection | Brush-based selection that grows into visually similar adjacent regions |
| Object/Subject Select | Automatic subject proposal; local heuristic implementation required, optional AI backend allowed |
| Select by brightness | Select pixels within a luminance range |
| Select by hue/saturation | Select pixels within HSV ranges |
| Invert selection | Select the complement of the current mask |
| Grow selection | Expand selection by a configurable pixel radius |
| Shrink selection | Contract selection by a configurable pixel radius |
| Feather selection | Convert hard mask edges into soft alpha transitions |
| Add to selection | Union current and new selection |
| Subtract from selection | Remove new selection from current mask |
| Intersect selection | Keep only overlapping selected pixels |
| Clear selection | Remove active selection |

## Magic Wand requirements

Magic Wand should use flood-fill-based region selection.

Parameters:

- Tolerance: 0–255, default 32
- Contiguous: true/false
- Sample size: 1×1, 3×3, 5×5, default 3×3
- Anti-aliasing: true/false
- Color space: RGB, Lab, HSV
- Add/subtract/intersect mode

Mathematical rule:

\[
\text{select}(p) =
\begin{cases}
1, & d(c_p, c_{\text{seed}}) \le T \\
0, & \text{otherwise}
\end{cases}
\]

where \(c_p\) is the pixel color, \(c_{\text{seed}}\) is the sampled seed color, \(T\) is tolerance, and \(d\) is a color-distance metric such as Euclidean RGB distance or perceptual Lab distance.

For contiguous mode, apply flood fill from the clicked seed pixel. For non-contiguous mode, evaluate every pixel in the image against the seed color.

## Color Range requirements

Color Range must select pixels globally, not only contiguous pixels.

Parameters:

- Sampled color
- Tolerance
- Fuzziness
- Color space: RGB, HSV, Lab
- Localized colors toggle
- Preview mask overlay

## Quick Selection requirements

Implement a brush-based selection tool.

Required behavior:

- User paints over an area.
- The tool expands the selection into neighboring pixels with similar color/gradient properties.
- User can paint to add or remove selection.
- Adjustable brush size, hardness, tolerance, edge sensitivity, and smoothness.
- Must work without requiring an external AI service.
- Optional enhancement: use a lightweight in-browser segmentation model only if it can run fully client-side and has a clear fallback.

## Subject Select requirements

Implement a local, deterministic fallback first:

- Detect prominent foreground using saliency heuristics, edge density, color clustering, and connected components.
- Produce a binary or soft mask.
- Allow the user to refine it with Quick Selection, Add, Subtract, and Feather.

Optional advanced mode:

- Use an ONNX Runtime Web model for salient object segmentation.
- Model must be loaded lazily.
- App must remain usable if model download fails.
- Clearly label AI-based subject selection as optional.

# Filter Application Scope

Every filter must support three application scopes:

1. **Whole image**
2. **Active selection**
3. **Feathered selection**

Rules:

- If no selection exists, apply the filter to the entire image.
- If a selection exists, apply the filter only to selected pixels.
- For soft selection masks, blend filtered and original pixels using the mask alpha:

\[
I_{\text{out}}(x,y) =
\alpha(x,y) I_{\text{filtered}}(x,y) +
(1 - \alpha(x,y)) I_{\text{original}}(x,y)
\]

where:

\[
\alpha(x,y) = \frac{M(x,y)}{255}
\]

- Filters with neighborhood operations must still use the original image as input, but write output only where selected.
- Prevent hard visible seams by supporting selection feathering.
- Show a clear indicator when a selection is active.
- Allow temporarily disabling selection without deleting it.

# Filter Registry

Create a central, extensible filter registry.

Each filter must be implemented as a `FilterDefinition` and must provide:

- Stable ID
- Display name
- Category
- Linear/nonlinear classification
- Parameter schema
- Default parameters
- Kernel matrix if applicable
- Mathematical formula
- Plain-English explanation
- Pseudocode or implementation notes
- Computational complexity
- Supported color modes
- Execution function
- Unit tests

The UI must dynamically render the filter list and parameter controls from this registry. Do not hard-code filter forms individually.

# Filter Catalog

Implement all filters below. Where a filter is algorithmic rather than a simple convolution, provide a meaningful mathematical or algorithmic explanation instead of a kernel.

## 1. Smoothing and Noise-Reduction Filters

Implement:

- Mean / Box / Average filter
- Weighted average filter
- Gaussian blur
- Binomial filter
- Circular averaging filter
- Median filter
- Weighted median filter
- Mode filter
- Min filter
- Max filter
- Midpoint filter
- Alpha-trimmed mean filter
- Contraharmonic mean filter
- Geometric mean filter
- Harmonic mean filter
- Bilateral filter
- Guided filter
- Anisotropic diffusion / Perona–Malik
- Non-local means
- Wiener filter
- Adaptive median filter
- Kuwahara filter
- Sigma filter
- Frost filter
- Lee filter
- Kuan filter
- Speckle-reducing anisotropic diffusion, SRAD

For every linear smoothing filter, expose:

- Kernel size
- Sigma where relevant
- Border handling
- Anchor point
- Normalization

For Gaussian blur, show the kernel formula:

\[
G(x,y) =
\frac{1}{2\pi\sigma^2}
e^{-\frac{x^2+y^2}{2\sigma^2}}
\]

For median filtering, show:

\[
I_{\text{out}}(x,y) =
\operatorname{median}
\{I(x+i,y+j) \mid (i,j) \in W\}
\]

For bilateral filtering, show both spatial and intensity weighting:

\[
I_{\text{out}}(p) =
\frac{
\sum_{q \in \Omega}
G_\sigma(p-q) G_r(I(p)-I(q)) I(q)
}{
\sum_{q \in \Omega}
G_\sigma(p-q) G_r(I(p)-I(q))
}
\]

## 2. Sharpening and Detail-Enhancement Filters

Implement:

- Laplacian sharpening
- Laplacian of Gaussian, LoG
- Difference of Gaussians, DoG
- Unsharp masking
- High-boost filtering
- High-pass filter
- Scharr-based sharpening
- Retinex / multi-scale Retinex
- CLAHE
- Bilateral/guided detail enhancement

For unsharp masking, use:

\[
I_{\text{sharp}} =
I + \lambda (I - I_{\text{blurred}})
\]

For Laplacian sharpening, use:

\[
I_{\text{sharp}} =
I - c \nabla^2 I
\]

Include common Laplacian kernels, for example:

\[
K =
\begin{bmatrix}
0 & -1 & 0 \\
-1 & 4 & -1 \\
0 & -1 & 0
\end{bmatrix}
\]

and:

\[
K =
\begin{bmatrix}
-1 & -1 & -1 \\
-1 & 8 & -1 \\
-1 & -1 & -1
\end{bmatrix}
\]

## 3. Gradient and Edge-Detection Filters

Implement:

- Roberts cross
- Prewitt
- Sobel
- Scharr
- Frei–Chen
- Kirsch compass
- Robinson compass
- Nevatia–Babu
- Laplacian
- Laplacian of Gaussian
- Difference of Gaussians
- Marr–Hildreth
- Canny edge detector
- Sobel with non-maximum suppression
- SUSAN edge detector
- Farid–Simoncelli derivative filter
- Deriche edge detector
- Shen–Castan edge detector
- Zero-crossing detector
- Hough-based edge linking
- Gabor filter
- Steerable filter

For Sobel, include horizontal and vertical kernels:

\[
K_x =
\begin{bmatrix}
-1 & 0 & 1 \\
-2 & 0 & 2 \\
-1 & 0 & 1
\end{bmatrix},
\quad
K_y =
\begin{bmatrix}
-1 & -2 & -1 \\
0 & 0 & 0 \\
1 & 2 & 1
\end{bmatrix}
\]

Gradient magnitude:

\[
|\nabla I| =
\sqrt{G_x^2 + G_y^2}
\]

Gradient direction:

\[
\theta =
\operatorname{atan2}(G_y, G_x)
\]

For Canny, implement the complete pipeline:

1. Gaussian smoothing
2. Gradient calculation
3. Non-maximum suppression
4. Double thresholding
5. Hysteresis edge tracking

Expose low threshold, high threshold, sigma, kernel size, and L1/L2 gradient norm options.

## 4. Line, Corner, and Feature Filters

Implement:

- Horizontal line detector
- Vertical line detector
- Diagonal line detectors
- Prewitt line masks
- Sobel line masks
- Laplacian-based line detector
- Hough transform for lines
- Hough transform for circles
- Harris corner detector
- Shi–Tomasi corner detector
- FAST corner detector
- SUSAN corner detector
- Moravec corner detector
- Gabor filter bank
- Difference of Gaussians blob detector
- LoG blob detector
- Determinant of Hessian blob detector
- SIFT-inspired scale-space keypoints
- SURF-inspired speeded features
- ORB-inspired binary features
- MSER region detector

For Harris corners, include:

\[
E(u,v) =
\sum_{x,y}
w(x,y)
[I(x+u,y+v)-I(x,y)]^2
\]

\[
M =
\sum_{x,y}
w(x,y)
\begin{bmatrix}
I_x^2 & I_xI_y \\
I_xI_y & I_y^2
\end{bmatrix}
\]

\[
R =
\det(M) - k(\operatorname{trace}(M))^2
\]

Expose sensitivity constant \(k\), window size, Gaussian sigma, and corner threshold.

## 5. Morphological Filters

Implement for binary and grayscale images:

- Erosion
- Dilation
- Opening
- Closing
- Morphological gradient
- Top-hat transform
- Black-hat transform
- Hit-or-miss transform
- Thinning
- Thickening
- Skeletonization
- Pruning
- Morphological reconstruction
- Area opening
- Area closing
- Alternate sequential filters

Use configurable structuring elements:

- 3×3 square
- 5×5 square
- Cross
- Disk with radius
- Line with angle and length
- Custom user-defined matrix

For erosion:

\[
I \ominus B =
\{z \mid B_z \subseteq I\}
\]

For dilation:

\[
I \oplus B =
\{z \mid \hat{B}_z \cap I \neq \emptyset\}
\]

For opening:

\[
I \circ B = (I \ominus B) \oplus B
\]

For closing:

\[
I \bullet B = (I \oplus B) \ominus B
\]

## 6. Frequency-Domain Filters

Implement using FFT where practical:

- Ideal low-pass filter
- Butterworth low-pass filter
- Gaussian low-pass filter
- Ideal high-pass filter
- Butterworth high-pass filter
- Gaussian high-pass filter
- Ideal band-pass filter
- Butterworth band-pass filter
- Gaussian band-pass filter
- Band-stop filter
- Notch filter
- Homomorphic filter
- Wiener deconvolution
- Constrained least-squares filter
- Inverse filter
- Radon/Fourier slice-based filtering
- Wavelet shrinkage denoising
- Curvelet-inspired directional filtering
- Shearlet-inspired directional filtering

For an ideal low-pass filter:

\[
H(u,v) =
\begin{cases}
1, & D(u,v) \le D_0 \\
0, & D(u,v) > D_0
\end{cases}
\]

where:

\[
D(u,v) =
\sqrt{(u-\frac{M}{2})^2 + (v-\frac{N}{2})^2}
\]

For a Butterworth low-pass filter:

\[
H(u,v) =
\frac{1}
{1 + \left(\frac{D(u,v)}{D_0}\right)^{2n}}
\]

For a Gaussian low-pass filter:

\[
H(u,v) =
e^{-\frac{D(u,v)^2}{2D_0^2}}
\]

Implement frequency-domain filters in a Web Worker. Show a live or computed FFT magnitude spectrum visualization where feasible.

## 7. Adaptive and Statistical Filters

Implement:

- Adaptive mean filter
- Adaptive median filter
- Adaptive Wiener filter
- Local variance filter
- Range filter
- Standard deviation filter
- Entropy filter
- Kuwahara filter
- Bilateral filter
- Guided filter
- Non-local means
- BM3D-inspired denoising
- Anisotropic diffusion
- Total variation denoising
- Rudin–Osher–Fatemi denoising
- Median absolute deviation thresholding

For adaptive Wiener filtering, expose local window size and noise variance. Use:

\[
\hat{I}(x,y) =
\mu + 
\frac{\sigma^2}{\sigma^2 + \sigma_n^2}
(I(x,y)-\mu)
\]

where \(\mu\) is local mean, \(\sigma^2\) is local variance, and \(\sigma_n^2\) is estimated noise variance.

## 8. Color Filters

Implement:

- Per-channel Gaussian filter
- Per-channel box filter
- Per-channel median filter
- Vector median filter
- Vector bilateral filter
- Chroma denoising filter
- White balance
- Gray-world color constancy
- Retinex-based color enhancement
- Vector anisotropic diffusion
- Demosaicing filter for Bayer-pattern simulation
- Color threshold filter
- Hue/saturation/value adjustment
- Channel mixer
- Color balance
- Vibrance
- Saturation
- Temperature/tint
- Black-and-white conversion
- Sepia conversion

For RGB-to-grayscale conversion, use:

\[
Y = 0.2126R + 0.7152G + 0.0722B
\]

## 9. Restoration and Deconvolution Filters

Implement:

- Inverse filter
- Wiener deconvolution
- Richardson–Lucy deconvolution
- Tikhonov regularization
- Total variation deblurring
- Linear motion deblurring
- Defocus deconvolution
- Blind deconvolution
- Regularized Lucy–Richardson deconvolution
- Landweber iteration
- Non-negative least-squares deconvolution

For Wiener deconvolution, use:

\[
\hat{F}(u,v) =
\left[
\frac{1}{H(u,v)}
\frac{|H(u,v)|^2}
{|H(u,v)|^2 + K}
\right]
G(u,v)
\]

where \(H\) is the degradation transfer function, \(G\) is the observed image spectrum, and \(K\) is a noise-to-signal parameter.

## 10. Artistic and Special-Effect Filters

Implement:

- Emboss
- Outline
- Edge enhance
- Posterize
- Solarize
- Sepia
- Vignette
- Oil-painting effect
- Pencil sketch
- Cartoon effect
- Bloom / glow
- Halftone
- Dithering
- Pixelate
- Fisheye distortion
- Barrel distortion
- Pincushion distortion
- Swirl distortion
- Ripple distortion
- Wave distortion
- Bokeh blur
- Tilt-shift blur

## 11. Segmentation and Thresholding Filters

Implement:

- Global threshold
- Manual threshold
- Otsu threshold
- Adaptive mean threshold
- Adaptive Gaussian threshold
- Sauvola threshold
- Niblack threshold
- Wolf threshold
- Bradley threshold
- Watershed segmentation
- Region growing
- Split-and-merge segmentation
- K-means color segmentation
- Mean-shift segmentation
- GrabCut-inspired interactive segmentation
- Active contours / snakes
- Chan–Vese segmentation
- Felzenszwalb graph-based segmentation
- SLIC superpixels

For Otsu thresholding, maximize between-class variance:

\[
\sigma_B^2(t) =
\omega_0(t)\omega_1(t)
[\mu_0(t)-\mu_1(t)]^2
\]

The selected threshold \(t^*\) is:

\[
t^* =
\arg\max_t \sigma_B^2(t)
\]

# Mathematical Documentation Panel

This is mandatory.

When the user selects any filter, the right-side documentation panel must display:

1. Filter name and category
2. Classification: linear, nonlinear, morphological, frequency-domain, adaptive, or algorithmic
3. Short explanation
4. Mathematical formula rendered with KaTeX or MathJax
5. Kernel matrix where applicable
6. Kernel divisor and offset
7. Kernel normalization explanation
8. Parameter definitions
9. Parameter effects
10. Border/padding strategy
11. Color-space behavior
12. Computational complexity
13. Memory usage considerations
14. Typical use cases
15. Advantages
16. Limitations and artifacts
17. Pseudocode
18. References

Example required display for a 3×3 box filter:

```text
Kernel:
[1 1 1]
[1 1 1]
[1 1 1]

Divisor: 9
Offset: 0
```

Formula:

\[
I_{\text{out}}(x,y) =
\frac{1}{9}
\sum_{i=-1}^{1}
\sum_{j=-1}^{1}
I(x+i,y+j)
\]

The documentation panel must update immediately when the user changes filter parameters. For example, if Gaussian sigma changes, show the regenerated discrete kernel matrix and its normalized values.

# Filter Parameter UI

For each selected filter:

- Show parameter controls generated from `FilterParameter[]`
- Numeric sliders with editable value inputs
- Integer-only enforcement where required
- Kernel-size selector: 3×3, 5×5, 7×7, 9×9, custom odd sizes
- Sigma control for Gaussian-family filters
- Threshold controls
- Structuring-element selector for morphology
- Direction and angle controls for directional filters
- Color-space selector where relevant
- Preview toggle
- Reset parameters button
- Save filter preset
- Load filter preset
- Copy filter settings as JSON
- Show estimated processing time after first execution

# Performance Requirements

- Filters must not freeze the UI thread.
- Use Web Workers for all operations expected to take more than approximately 16 ms.
- Use WebGL or GPU acceleration for convolution, blur, bilateral filtering, and real-time preview where practical.
- Use typed arrays: `Uint8ClampedArray`, `Float32Array`, and `Float64Array` where appropriate.
- Avoid unnecessary image copies.
- Support cancellation of long-running operations.
- Show progress indicator for operations longer than 300 ms.
- Cache filter results when parameters and selection have not changed.
- Use incremental preview at reduced resolution for large images, then execute full-resolution processing on Apply.
- Support images up to at least 6000 × 6000 pixels without crashing in a modern desktop browser.

# Undo / Redo and Non-Destructive Editing

Implement a history system:

- Every applied filter creates a history entry.
- Store enough data to restore previous states.
- For memory efficiency, store compressed snapshots or filter-operation records where feasible.
- Show history timeline with:
  - Filter name
  - Parameters
  - Selection scope
  - Timestamp
  - Thumbnail
- Allow jumping to any prior state.
- Allow deleting a history entry.
- Support at least 50 history entries or use intelligent memory management.
- Preserve original uploaded image permanently.

# Export Requirements

Support export as:

- PNG
- JPEG with quality slider
- WebP with quality slider
- Original dimensions
- Custom resized dimensions
- Optional metadata stripping
- Download with meaningful filename, for example:

```text
original-name_gaussian-blur_sigma-2.png
```

# Accessibility Requirements

- Full keyboard navigation
- ARIA labels for all controls
- Visible focus states
- Color-contrast compliant UI
- Screen-reader announcements for filter application, progress, errors, and export completion
- Respect `prefers-reduced-motion`
- Do not rely on color alone to communicate selection state

# UI Layout

Use a three-panel desktop layout:

```text
+--------------------------------------------------------------+
| Header: Logo | File | Edit | Selection | Filters | View | Export |
+----------------+---------------------------------+-----------+
| Tools          | Canvas workspace                | Filter /  |
| - Upload       | Zoom, pan, selection overlay    | Docs      |
| - Move         | Before/after comparison         | panel     |
| - Selection    |                                 |           |
| - Filters      |                                 |           |
| - History      |                                 |           |
+----------------+---------------------------------+-----------+
| Status bar: image size | zoom | selection info | progress      |
+--------------------------------------------------------------+
```

On tablet/mobile:

- Collapse side panels into drawers or tabs
- Preserve core upload, select, filter, undo, and export workflows
- Use touch-friendly controls

# Code Quality Requirements

- TypeScript strict mode
- No `any` unless unavoidable and documented
- Pure, testable filter functions
- Clear separation between UI, image processing, selection, and history
- Filter implementations must be independent of React
- Use dependency injection or registry pattern for filters
- Add JSDoc comments to public APIs
- Include README with setup, architecture, and instructions to add a new filter
- Include a `FILTER_DEVELOPMENT_GUIDE.md` explaining how to add a custom filter

# Required Tests

Implement tests for:

- Image upload and decoding
- Selection mask creation
- Rectangle, ellipse, lasso, magic wand, and color-range selection
- Add/subtract/intersect/invert selection
- Feathering
- Convolution correctness
- Gaussian kernel normalization
- Median filter behavior
- Sobel gradient magnitude
- Canny pipeline stages
- Morphological erosion/dilation/opening/closing
- Selection-scoped filtering
- Feathered blending
- Undo/redo
- Export file generation
- Filter registry completeness
- Mathematical documentation rendering

Use small synthetic images where possible, for example:

```text
5×5 gradient image
8×8 checkerboard
16×16 image with a known object
Image with salt-and-pepper noise
```

# Developer Experience

Create these commands:

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm test
pnpm test:coverage
pnpm lint
pnpm format
```

Create:

- `README.md`
- `ARCHITECTURE.md`
- `FILTER_DEVELOPMENT_GUIDE.md`
- `SELECTION_TOOLS.md`
- `.env.example`
- `CLAUDE.md`

# Implementation Plan

Follow this order:

1. Scaffold Vite + React + TypeScript + Tailwind project.
2. Implement image upload, decoding, canvas rendering, zoom, and pan.
3. Implement selection mask model and basic rectangle/ellipse selection.
4. Implement lasso, polygon, magic wand, color range, quick selection, and subject-select fallback.
5. Implement selection operations: add, subtract, intersect, invert, grow, shrink, feather.
6. Build filter registry, parameter UI, and documentation panel.
7. Implement linear filters first: box, Gaussian, Sobel, Prewitt, Roberts, Laplacian, unsharp masking.
8. Implement nonlinear filters: median, min, max, bilateral, Kuwahara, adaptive median.
9. Implement morphology.
10. Implement edge detectors, including Canny.
11. Implement frequency-domain filters with Web Workers.
12. Implement restoration, segmentation, color, and artistic filters.
13. Implement history, compare view, export, tests, and documentation.
14. Optimize performance and add GPU acceleration where beneficial.

# Non-Goals

Do not implement:

- User authentication
- Cloud storage
- Collaborative editing
- Video editing
- A mandatory backend
- Paid third-party APIs
- Server-side image processing for the core workflow
- Social sharing
- Mobile-native applications

# Acceptance Criteria

The implementation is complete only when all of the following are true:

1. `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm test`, and `pnpm lint` run successfully.
2. A user can upload an image by drag-and-drop, file picker, or clipboard paste.
3. The user can zoom, pan, and inspect the image on canvas.
4. The user can create selections using rectangle, ellipse, lasso, polygon, magic wand, color range, quick selection, and subject-select fallback.
5. The user can add, subtract, intersect, invert, grow, shrink, feather, and clear selections.
6. Every filter in the catalog is available through the filter registry.
7. Selecting a filter displays its formula, kernel matrix where applicable, parameters, pseudocode, complexity, advantages, and limitations.
8. A filter can be applied to the full image or only to the active selection.
9. Feathered selection blends filtered and original pixels smoothly.
10. Filter execution does not block the UI thread.
11. Undo/redo works for every applied filter.
12. The user can compare original and processed images using split view or side-by-side view.
13. The user can export PNG, JPEG, and WebP files.
14. Core filters have unit tests.
15. The UI is responsive and accessible.
16. The project includes complete README, architecture, filter-development, and selection-tool documentation.

# Deliverables

Provide:

1. Complete project source code.
2. All configuration files.
3. Filter registry implementation.
4. Selection-tool implementations.
5. Web Worker implementations.
6. Tests.
7. Documentation files.
8. A short summary of:
   - Files created
   - Architecture decisions
   - Filters implemented
   - Known limitations
   - Suggested next improvements