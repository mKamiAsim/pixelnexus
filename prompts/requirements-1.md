# Claude Code Master Prompt: Build a Comprehensive Web-Based Image Processing Studio

## 1. Project Objective

Build a professional, modern, web-based image processing application that provides a comprehensive collection of classical and advanced image processing filters. The application must allow users to upload images, select filters, adjust parameters, apply filters to an entire image or a selected region, and inspect the mathematical foundations of each operation.

The application should combine the usability of Adobe Photoshop, the educational capabilities of a scientific image-processing laboratory, and the extensibility of a professional image-editing platform.

This is a functional engineering project, not a static UI prototype. Every implemented filter must perform its actual image-processing operation. Every filter must have a dedicated mathematical and technical reference panel.

### Mandatory development approach

Before modifying any source code:

1. Inspect the existing repository, development environment, installed libraries, architecture, and available dependencies.
2. Identify the best implementation strategy for the required functionality.
3. Prepare a detailed implementation plan covering architecture, dependencies, image-processing algorithms, region selection, mathematical visualization, testing, and deployment.
4. Present the plan first. Do not start implementing until the plan has been presented and approved.
5. Divide the work into manageable phases with clear acceptance criteria.
6. After approval, implement the application incrementally, testing each phase before proceeding.

Do not unnecessarily replace working code or introduce a complex architecture without justification.

## 2. Core Functional Requirements

The application must support the following capabilities.

### 2.1 Image import and management

- Upload PNG, JPEG, JPG, WebP, TIFF, BMP, and other practical image formats supported by the selected libraries.
- Support multiple images in a project or workspace.
- Display the original image and the currently processed image.
- Preserve the original image without destructive modification.
- Maintain an editable processing history.
- Allow undo, redo, reset, and restoration to the original image.
- Support image metadata inspection, including dimensions, color channels, bit depth when available, and file format.
- Support zoom, pan, fit-to-screen, and pixel-level inspection.
- Support comparison modes: before/after, side-by-side, split view, and opacity overlay.
- Export the processed image in supported formats and appropriate quality settings.
- Preserve alpha transparency when supported by the operation.
- Warn users when an operation changes color space, bit depth, dimensions, or transparency.

Handle large images efficiently. Avoid unnecessary copies of full-resolution images in the browser.

### 2.2 Filter library and discovery

Organize filters into searchable categories.

Users must be able to:

- Search by filter name, functionality, mathematical method, and category.
- Browse filters by linearity, spatial/frequency domain, noise type, and intended purpose.
- Mark favorite filters.
- Compare multiple filters using the same source image.
- Adjust parameters interactively.
- Preview parameter changes before committing them.
- Apply the same filter repeatedly with different settings.
- Save and reuse filter presets.
- Chain multiple filters into a processing pipeline.
- Enable or disable individual pipeline operations.
- Reorder pipeline operations.
- Apply a filter to the entire image, a selection, or an inverted selection.
- View the mathematical explanation, kernel, parameters, complexity, and limitations of each filter.

Clearly distinguish between filters that are fully implemented, filters that require optional dependencies, and filters that require downloadable pretrained models.

Never show a filter as available when its implementation is missing.

## 3. Image Selection and Masking System

This is one of the most important components. Users must be able to select precise image regions, similarly to Photoshop, and apply any compatible filter only to those regions.

Implement a dedicated selection toolbar.

### 3.1 Manual selection tools

Implement the following:

- Rectangular marquee selection.
- Elliptical marquee selection.
- Freehand lasso selection.
- Polygonal lasso selection.
- Magnetic lasso or edge-assisted boundary selection.
- Brush selection.
- Eraser for removing areas from a selection.
- Add-to-selection and subtract-from-selection modes.
- Intersect-selection mode.
- Invert selection.
- Select all and deselect.
- Feather selection.
- Expand and contract selection.
- Smooth selection boundaries.
- Border selection.
- Selection from an existing alpha channel or mask.

Display the active selection as a visible overlay or marching-ants boundary.

### 3.2 Photoshop-style automatic selection

Implement the following tools:

**Quick Selection**

- Allow the user to paint over the desired subject.
- Expand the selection using color, texture, and boundary similarity.
- Allow adding and subtracting regions.
- Support brush size, tolerance, and edge sensitivity controls.

**Magic Wand**

- Select connected pixels with similar colors.
- Provide tolerance, contiguous/non-contiguous, anti-aliasing, and feather options.
- Allow selection based on RGB, HSV, Lab, or another suitable color space.

**Color Range Selection**

- Select pixels by sampled color and similarity.
- Support multiple color samples.
- Display a grayscale selection preview.
- Include fuzziness, range, and luminance controls.
- Support highlights, shadows, and sampled-color selection where appropriate.

**Object Selection**

- Allow drawing a rectangle or lasso around an object.
- Use a suitable segmentation model to identify the object within the candidate region.
- Provide an optional model-backed implementation using a compatible segmentation model.

**Subject Selection**

- Provide a one-click option to identify and select the main subject.
- Support foreground/background separation.
- Offer refinement controls for hair, fine edges, semi-transparent boundaries, and small details where the chosen model supports them.

**Click-to-select segmentation**

- Positive clicks indicate the foreground.
- Negative clicks indicate the background.
- Recompute the selection using the supported segmentation model.
- Permit multiple foreground and background prompts.

**Background Selection**

- Detect and select the background.
- Allow inversion to obtain the foreground subject.
- Provide manual correction tools.

**Edge-based selection**

- Detect nearby edges to help users trace object boundaries.
- Allow adjustable edge strength, smoothing, and boundary tolerance.

### 3.3 Selection implementation and dependencies

Use conventional image-processing algorithms for manual selection, color-based selection, connected-component selection, and edge-assisted selection.

For automatic semantic object selection, use an appropriate pretrained segmentation model, such as a compatible Segment Anything Model implementation or another suitable model with a clear license.

Do not assume that a pretrained model is automatically installed or freely redistributable. Verify licensing, hardware requirements, model download requirements, and supported execution environments.

The application must remain usable without AI models. Manual selection, color selection, masking, and traditional image-processing functions must work independently.

AI-assisted selection must have clear loading indicators and a graceful fallback when the model is unavailable.

### 3.4 Mask representation and behavior

Represent selections as masks, preferably with a consistent internal convention:

- 0: fully unselected.
- 1 or 255: fully selected, depending on the internal representation.
- Intermediate values: partially selected pixels for feathered boundaries.

Normalize mask conventions at API boundaries.

Support binary and soft masks, mask preview, mask inversion, mask editing, and reusable named masks.

When applying a filter to a selected region, blend the processed result with the original image:

\[
I_{\text{out}}(x,y)=M(x,y)F(I)(x,y)
+(1-M(x,y))I(x,y)
\]

Here, \(I\) is the original image, \(F(I)\) is the filtered image, and \(M\) is the selection mask normalized to the range \([0,1]\).

For filters that depend on neighboring pixels, such as Gaussian, median, bilateral, and convolution filters, calculate the filter using the appropriate image context. Do not crop the selection first in a way that introduces artificial boundaries.

Support feathered selections and ensure that processing does not create visible seams along the selected region.

For geometry-changing operations, define how masks and image dimensions are transformed. For global or inherently non-local algorithms, document any restrictions on regional processing.

## 4. Filter Catalog: Required Scope

Organize the following filters into appropriate categories. This catalog is the required functional scope, not permission to create placeholder entries.

The implementation plan must classify each filter into:

1. Core implementation.
2. Advanced implementation.
3. Optional dependency or model.
4. Deferred implementation, if necessary.

Prefer implementing the most useful classical filters first. However, maintain the complete catalog and a clear implementation status for every listed method.

### Category A: Linear spatial filters

Implement and catalog:

- Box filter.
- Mean filter.
- Average filter.
- Weighted average filter.
- Gaussian filter.
- Separable Gaussian filter.
- Binomial filter.
- Triangular filter.
- Disk or circular averaging filter.
- Motion blur filter.
- Defocus blur filter.
- Low-pass FIR filter.
- Ideal low-pass filter.
- Butterworth low-pass filter.
- Laplacian filter.
- Sobel X and Y.
- Prewitt X and Y.
- Roberts Cross.
- Scharr X and Y.
- Kirsch compass filter.
- Frei–Chen filters.
- High-pass filter.
- High-boost filter.
- Unsharp mask.
- Difference of Gaussians.
- Laplacian of Gaussian.
- Gabor filter.
- Steerable filters.
- Wiener linear filter.
- Matched filter.

### Category B: Nonlinear spatial filters

- Median filter.
- Weighted median filter.
- Adaptive median filter.
- Min filter.
- Max filter.
- Midpoint filter.
- Alpha-trimmed mean filter.
- Contraharmonic mean filter.
- Geometric mean filter.
- Harmonic mean filter.
- Rank-order filter.
- Percentile filter.
- Kuwahara filter.
- Nagao–Matsuyama filter.
- Bilateral filter.
- Joint bilateral filter.
- Guided filter.
- Domain transform filter.
- Rolling guidance filter.
- Anisotropic diffusion.
- Non-local means.
- BM3D.
- BM4D for volumetric data.
- Total variation denoising.
- Bilateral solver.
- SUSAN.
- Bitonic filter.
- Switching median filter.

### Category C: Adaptive and statistical filters

- Adaptive Wiener filter.
- Lee filter.
- Enhanced Lee filter.
- Kuan filter.
- Frost filter.
- Gamma-MAP filter.
- Sigma filter.
- Adaptive local noise reduction.
- Adaptive smoothing.
- Least Mean Squares adaptive filter.
- Recursive Least Squares adaptive filter.
- Kalman filter.
- Particle filter.
- Robust M-estimator filter.
- RANSAC-based robust estimation.
- Steering kernel regression.
- Regression-based filters.

Identify algorithms that require sequential data, noise estimates, or model assumptions. Do not present such algorithms as ordinary fixed convolution kernels.

### Category D: Morphological filters

- Erosion.
- Dilation.
- Opening.
- Closing.
- Opening by reconstruction.
- Closing by reconstruction.
- Morphological gradient.
- Internal gradient.
- External gradient.
- Top-hat.
- Black-hat or bottom-hat.
- White top-hat.
- Hit-or-miss.
- Thinning.
- Thickening.
- Skeletonization.
- Pruning.
- Medial axis.
- Convex hull.
- Morphological reconstruction.
- Attribute opening.
- Area opening.
- Area closing.
- Connected-component filtering.
- Geodesic filtering.
- Alternating sequential filter.
- Morphological leveling.

Provide a configurable structuring element: rectangle, ellipse, cross, or custom footprint. Support adjustable size, iterations, connectivity, and border handling where applicable.

### Category E: Frequency-domain filters

- Ideal low-pass.
- Ideal high-pass.
- Ideal band-pass.
- Ideal band-reject.
- Butterworth low-pass.
- Butterworth high-pass.
- Butterworth band-pass.
- Butterworth band-reject.
- Gaussian low-pass.
- Gaussian high-pass.
- Gaussian band-pass.
- Notch-reject.
- Notch-pass.
- Comb filter.
- Homomorphic filter.
- Phase-only filter.
- Inverse filter.
- Constrained least-squares filter.
- Wiener frequency filter.
- Matched frequency filter.
- Spectral whitening.
- Periodic-noise suppression.
- Log-Gabor filter.

Provide a frequency spectrum visualization where appropriate. Allow users to adjust cutoff frequency, order, bandwidth, notch locations, and other relevant parameters.

### Category F: Wavelet and multiscale filters

- Haar wavelet thresholding.
- Daubechies wavelet filtering.
- Symlet wavelet filtering.
- Coiflet wavelet filtering.
- Stationary wavelet filtering.
- Dual-tree complex wavelet filtering.
- Wavelet hard thresholding.
- Wavelet soft thresholding.
- BayesShrink.
- SureShrink.
- Wavelet Wiener filtering.
- Curvelet filtering.
- Contourlet filtering.
- Shearlet filtering.
- Ridgelet filtering.
- Laplacian pyramid filtering.
- Gaussian pyramid filtering.
- Scale-space filtering.
- Multiresolution diffusion.
- Non-subsampled contourlet filtering.

Use suitable specialist libraries when implementing transforms that are not practical to implement reliably from scratch.

### Category G: Edge detection and boundary analysis

- Sobel.
- Prewitt.
- Roberts Cross.
- Scharr.
- Laplacian.
- Laplacian of Gaussian.
- Difference of Gaussians.
- Canny.
- Marr–Hildreth.
- Kirsch compass.
- Robinson compass.
- Frei–Chen.
- Morphological gradient.
- Deriche.
- Shen–Castan.
- SUSAN.
- Structured Edge Detector.
- Phase congruency.
- Zero-crossing detector.
- Hysteresis thresholding.

For multistage algorithms, expose the important intermediate results and parameters.

### Category H: Texture, corners, blobs, and features

- Gabor filter bank.
- Log-Gabor.
- Laws' texture energy filters.
- Local Binary Pattern.
- Local Ternary Pattern.
- Gray-Level Co-occurrence Matrix features.
- Frangi vesselness filter.
- Sato filter.
- Meijering filter.
- Hessian-based filters.
- Laplacian of Gaussian blob detection.
- Difference of Gaussians keypoint detection.
- Determinant of Hessian.
- Harris corner detector.
- Shi–Tomasi.
- FAST.
- SIFT.
- SURF, subject to implementation and licensing verification.
- ORB.
- Histogram of Oriented Gradients.
- Steerable pyramid filters.
- Gabor wavelet bank.
- Phase congruency.
- Matched vessel filters.
- Oriented line filters.
- Ridge filters.

Separate image-transforming filters from feature detectors and feature descriptors. For detection methods, show overlays, keypoints, orientations, and scores rather than pretending that the detector produces an ordinary filtered photograph.

### Category I: Enhancement, illumination, and color

- Histogram equalization.
- CLAHE.
- Gamma correction.
- Log transformation.
- Contrast stretching.
- Percentile normalization.
- Adaptive histogram equalization.
- Retinex.
- Single-scale Retinex.
- Multi-scale Retinex.
- Homomorphic filtering.
- Unsharp masking.
- High-boost filtering.
- Local Laplacian filtering.
- Tone mapping.
- White balance.
- Gray-world correction.
- White-patch correction.
- Chromatic adaptation.
- Saturation adjustment.
- Hue rotation.
- Chroma denoising.
- Luminance-only filtering.
- Color-space filtering.
- Bilateral tone mapping.

Clearly separate point operations, color transformations, local filters, and illumination-estimation algorithms.

### Category J: Restoration and reconstruction

- Inverse filtering.
- Wiener restoration.
- Richardson–Lucy.
- Landweber iteration.
- Constrained least squares.
- Total variation restoration.
- Blind deconvolution.
- Non-blind deconvolution.
- Lucy–Richardson deconvolution.
- Tikhonov regularization.
- Sparse regularization.
- Plug-and-play restoration.
- Regularization by Denoising (RED).
- Motion deblurring.
- Defocus deblurring.
- Image inpainting.
- Super-resolution reconstruction.
- Debanding.
- Descreening.
- Dead-pixel correction.
- Deblocking.
- Deringing.
- JPEG artifact removal.
- Dehazing.

Do not imply that a restoration algorithm can recover information that is absent from the input. Distinguish exact reconstruction under a known model from approximate reconstruction and learned detail generation.

### Category K: Segmentation and region-based processing

- Global thresholding.
- Otsu thresholding.
- Adaptive thresholding.
- Sauvola thresholding.
- Niblack thresholding.
- Watershed.
- Marker-controlled watershed.
- Graph cuts.
- GrabCut.
- Random walker.
- Mean shift.
- SLIC superpixels.
- Conditional Random Fields.
- Morphological reconstruction.
- Connected-component labeling.
- Region growing.
- Active contours.
- Level sets.
- Felzenszwalb–Huttenlocher segmentation.

Support overlays, label maps, region statistics, object counts, and mask export where appropriate.

### Category L: Deep-learning and learned image processing

- CNN denoiser.
- DnCNN.
- U-Net.
- FFDNet.
- Noise2Noise.
- Noise2Void.
- NAFNet.
- Restormer.
- MPRNet.
- SwinIR.
- Real-ESRGAN.
- SRCNN.
- EDSR.
- DnCNN-based deblocking.
- Deep Image Prior.
- Diffusion-based restoration.
- Diffusion-based super-resolution.
- Learned deconvolution.
- Neural bilateral filters.
- Dynamic filter networks.
- Deformable convolution.
- Attention-based restoration.
- Transformer-based denoising.
- Neural style and texture filters.
- Learned edge detectors.
- Neural relighting and enhancement.

Use a model registry for optional neural models. Display each model's availability, download status, license, expected memory requirements, and device support.

Do not bundle enormous pretrained weights into the application by default. Support explicit downloads and local model paths where practical.

## 5. Mathematical Explanation and Kernel Inspector

This feature is mandatory and must be a first-class part of the interface.

Whenever a user selects a filter, display a technical panel containing the applicable mathematical model, parameters, kernel or operator representation, and implementation details.

### 5.1 Required information for each filter

For every catalog entry, provide:

1. Filter name and category.
2. Primary purpose.
3. Short conceptual explanation.
4. Mathematical formula in readable LaTeX.
5. Definition of every symbol used in the formula.
6. Kernel matrix, if the operation uses a fixed discrete kernel.
7. Parameter descriptions and default values.
8. Interactive parameter controls.
9. An example of the filter's effect.
10. The algorithmic steps.
11. Time and memory complexity, where reasonably definable.
12. Boundary-handling behavior.
13. Supported image types and color spaces.
14. Whether the filter is linear or nonlinear.
15. Whether it is spatial-domain, frequency-domain, transform-domain, statistical, morphological, iterative, or learning-based.
16. Known limitations and potential artifacts.
17. Implementation library and algorithm reference.
18. Source-code implementation location for developer inspection.
19. Whether the output is an image, mask, feature map, label map, or transformed representation.

The mathematical reference must describe the actual algorithm used. Never display a generic formula unrelated to the implementation.

### 5.2 Fixed convolution kernels

For a selected convolution filter, show the kernel matrix as a properly formatted numerical grid.

For example, the Sobel X kernel should be displayed as:

\[
K_x=
\begin{bmatrix}
-1&0&1\\
-2&0&2\\
-1&0&1
\end{bmatrix}
\]

The Sobel Y kernel should be displayed separately.

For the Laplacian, provide the selected kernel variant, for example:

\[
K=
\begin{bmatrix}
0&1&0\\
1&-4&1\\
0&1&0
\end{bmatrix}
\]

For Gaussian filtering, calculate the discrete kernel from the selected sigma and kernel size, normalize its coefficients, and show the actual resulting matrix.

Users must be able to inspect the actual kernel values used in the current operation.

Include controls for:

- Kernel size.
- Sigma or standard deviation.
- Kernel coefficients when editing is supported.
- Normalization.
- Anchor or center position when supported.
- Border-handling mode.
- Convolution versus correlation conventions.

When a kernel is editable, validate the input and update the preview and mathematical reference.

### 5.3 Formula and parameter synchronization

The formula, kernel matrix, parameter controls, and processing engine must stay synchronized.

When a user changes sigma, kernel size, threshold, iteration count, or another parameter:

- Update the formula's displayed parameter values.
- Recompute the kernel where applicable.
- Update the kernel matrix.
- Update the preview.
- Update the technical description where parameter-dependent.
- Ensure the backend receives the same validated parameters.

Do not hardcode kernel matrices in the UI independently from the actual processing implementation.

Use a single authoritative filter definition and parameter schema to drive both the UI and backend execution.

### 5.4 Filters without fixed kernel matrices

Many valid image-processing operations do not have a single fixed convolution kernel. For those filters, show the most appropriate mathematical representation instead.

Examples:

**Median filter**

\[
I_{\mathrm{out}}(x,y)=
\operatorname{median}
\{I(x+i,y+j):(i,j)\in W\}
\]

Display the neighborhood window, window size, and an illustrative calculation.

**Bilateral filter**

\[
I_{\mathrm{out}}(p)=
\frac{1}{Z_p}
\sum_{q\in\Omega}
G_s(\|p-q\|)
G_r(|I(p)-I(q)|)I(q)
\]

Display spatial and intensity similarity terms, their parameters, and the normalization factor.

**Morphological erosion**

\[
(I\ominus B)(x)=
\min_{b\in B}I(x+b)
\]

Display the structuring element rather than a convolution kernel.

**Morphological dilation**

\[
(I\oplus B)(x)=
\max_{b\in B}I(x-b)
\]

Explain the footprint and boundary conventions used by the implementation.

**Wiener filtering**

Show the applicable spatial or frequency-domain formulation and the noise and signal assumptions used.

**Canny edge detection**

Show its processing stages: smoothing, gradient computation, non-maximum suppression, double thresholding, and hysteresis.

**Wavelet thresholding**

Show the transform, coefficient thresholding rule, and inverse transform.

**Watershed segmentation**

Show the gradient or topographic representation, markers, connectivity, and flooding concept.

**Non-local means**

Show the patch-similarity weights and the weighted aggregation formula.

**BM3D**

Show the main stages: block matching, collaborative transform, coefficient shrinkage or estimation, inverse transform, and aggregation.

**Deep-learning filters**

Show the model architecture or processing pipeline, model identity, input/output tensor shape, and available model documentation. Do not invent a simple convolution matrix for a large neural network.

**Adaptive and statistical filters**

Show the estimator, its assumptions, and the parameters that affect the result.

For every algorithm, explicitly label whether its displayed representation is a mathematical definition, an approximation, a simplified explanation, or the exact computation.

### 5.5 Developer mode

Add a Developer / Mathematics panel with:

- Filter identifier.
- Filter definition schema.
- Parameter schema.
- Formula source or mathematical documentation.
- Kernel-generation function, when applicable.
- Processing implementation path.
- Dependency and version information.
- Input and output type requirements.
- Data type and color-space conversion behavior.
- Unit tests associated with the filter.
- Execution timing and memory estimates where available.
- Warnings about unsupported operations or parameter combinations.

Provide a copyable mathematical description and a copyable JSON representation of the current filter configuration.

Where feasible, include a small illustrative numeric example that demonstrates how the filter transforms a neighborhood.

Do not expose secrets, private filesystem paths, environment variables, or sensitive server information in the browser.

## 6. Interactive User Interface

Create a professional desktop-first workspace, with responsive behavior for smaller screens.

### 6.1 Main layout

Use a layout similar to a professional image editor:

**Left sidebar**
- Image selection and layer list.
- Selection tools.
- Mask management.
- Basic geometric operations.
- Filter category navigation.

**Center workspace**
- Image canvas.
- Zoom and pan.
- Selection overlays.
- Before/after comparison.
- Preview rendering.
- Overlay display modes.

**Right sidebar**
- Selected filter name and category.
- Filter parameters.
- Apply, cancel, and reset controls.
- Selection scope.
- Filter mathematics and kernel inspector.
- Execution information.

**Top toolbar**
- Open image.
- Save/export.
- Undo/redo.
- Zoom controls.
- Compare.
- Selection mode.
- Processing history.
- Workspace settings.

Use tabs or collapsible panels to keep the technical information accessible without overwhelming the image canvas.

### 6.2 Visual design

The interface should be polished, consistent, and appropriate for both professional users and students learning image processing.

Use:

- A restrained dark editor theme with an optional light theme.
- Consistent spacing and typography.
- Clear icons and labels.
- Tooltips for mathematical and technical terminology.
- Numerical inputs for exact parameter values.
- Sliders for interactive adjustment.
- Keyboard shortcuts for common editing operations.
- Clear empty, loading, error, and success states.
- Accessible focus indicators and keyboard navigation.

Avoid unnecessary decorative cards, excessive gradients, generic dashboard layouts, and large unused spaces.

The image canvas must remain the primary focus.

## 7. Filter Execution and Preview Engine

Build a reliable processing engine that supports interactive previews and reproducible final output.

### 7.1 Processing pipeline

Represent the editing history as an ordered list of operations. Each operation should contain:

- A unique operation ID.
- Filter ID.
- Validated parameters.
- Optional selection or mask reference.
- Input and output metadata.
- Execution status.
- Error information when applicable.

Support non-destructive editing by preserving the original image and recording operations in a reproducible processing history.

For expensive operations, cache intermediate results where appropriate and invalidate the cache when upstream inputs or parameters change.

### 7.2 Preview and performance

- Use lower-resolution previews for expensive operations when beneficial.
- Keep preview and final-processing parameter values consistent.
- Clearly identify approximate previews.
- Use background workers for CPU-intensive browser tasks.
- Use a background processing queue for long-running backend tasks.
- Support cancellation of operations.
- Display progress and processing time where measurable.
- Avoid blocking the entire interface during processing.
- Apply resource limits to prevent memory exhaustion.

Do not silently substitute a lower-quality algorithm when an advanced method fails. Show the failure and offer a clearly labeled alternative.

### 7.3 Image processing correctness

Define consistent conventions for:

- RGB, BGR, RGBA, grayscale, and other supported formats.
- Integer and floating-point pixel ranges.
- Alpha premultiplication where required.
- Clipping and normalization.
- Border padding.
- Convolution and correlation.
- Multichannel filtering.
- Color-space conversion.
- NaN and infinite-value handling.
- Image dimensions and coordinate mapping.
- Selection-mask resampling.

Ensure that filtering only selected regions does not unexpectedly alter pixels outside the selection, except where an explicitly documented operation changes image geometry or uses a global transformation.

## 8. Recommended Technical Architecture

Inspect the repository before choosing the final stack. If no existing stack is mandated, use the following as the default architecture.

### Frontend

- React.
- TypeScript.
- Vite.
- A maintainable component library or well-structured custom components.
- Canvas-based rendering, with a suitable canvas abstraction or WebGL where justified.
- Web Workers for supported browser-side operations.
- A mathematical rendering library capable of displaying LaTeX.
- A typed API client.
- A dedicated state-management strategy for image editing, selections, filter settings, and processing history.

Choose a suitable canvas library only after evaluating selection overlays, high-resolution rendering, coordinate transforms, and performance.

### Backend

- Python.
- FastAPI.
- NumPy.
- OpenCV.
- SciPy.
- scikit-image where appropriate.
- Pillow for image I/O and format conversion.
- PyWavelets for supported wavelet methods.
- Additional specialist libraries only when needed and compatible.

Use a plugin-based filter registry rather than one enormous processing module.

Optional model integrations may use PyTorch or other compatible inference frameworks. Keep them optional so the application can start without downloading large neural-network dependencies.

### Processing placement

Use browser-side execution for suitable lightweight operations and backend execution for CPU-intensive, specialized, or model-based operations.

Do not duplicate algorithms unnecessarily between frontend and backend. Each filter must have a defined authoritative implementation, parameter schema, and execution location.

Provide a consistent interface regardless of where the operation executes.

### Suggested project structure

Adapt the structure to the repository instead of blindly creating duplicate directories.

- `frontend/`
  - `components/`
  - `canvas/`
  - `selection/`
  - `filters/`
  - `mathematics/`
  - `state/`
  - `api/`
  - `workers/`
  - `tests/`

- `backend/`
  - `api/`
  - `core/`
  - `filters/`
    - `linear/`
    - `nonlinear/`
    - `morphology/`
    - `frequency/`
    - `wavelets/`
    - `enhancement/`
    - `restoration/`
    - `features/`
    - `segmentation/`
    - `learned/`
  - `selection/`
  - `mathematics/`
  - `models/`
  - `schemas/`
  - `tests/`

- `docs/`
- `scripts/`
- `docker/`

Keep dependencies and interfaces explicit. Avoid circular imports and unnecessary service layers.

## 9. Filter Registry and Mathematical Metadata

Create a centralized, typed filter registry. The registry must be the single source of truth for filter metadata, supported parameters, mathematical documentation, and execution capability.

Each filter definition should include fields equivalent to:

- `id`
- `name`
- `category`
- `description`
- `functionality`
- `linearity`
- `domain`
- `operation_type`
- `formula`
- `formula_explanation`
- `kernel_type`
- `kernel_generator`
- `parameter_schema`
- `default_parameters`
- `supported_dtypes`
- `supported_color_spaces`
- `supports_mask`
- `supports_preview`
- `execution_location`
- `implementation_status`
- `dependencies`
- `limitations`
- `complexity`
- `references`
- `implementation_path`
- `test_reference`

Adapt field names to the chosen programming language and architecture.

The registry must support the following kernel representations:

1. Fixed numerical matrix.
2. Dynamically generated convolution kernel.
3. Structuring element or footprint.
4. Neighborhood or rank-based operation.
5. Frequency response.
6. Transform-domain operator.
7. Iterative optimization algorithm.
8. Statistical estimator.
9. Feature extraction or segmentation algorithm.
10. Neural model architecture or inference pipeline.

Create a common metadata schema, but do not force every algorithm into the same mathematical representation.

The UI must derive its filter list, controls, documentation, and kernel visualization from this registry. Do not maintain separate, inconsistent lists in different frontend components.

## 10. API Design

Create well-defined API endpoints for the following operations, adapting to the selected architecture:

- Upload and validate images.
- Retrieve image metadata.
- List filter categories and filter definitions.
- Retrieve a specific filter's mathematical metadata.
- Generate or retrieve a parameter-dependent kernel.
- Apply a filter.
- Generate a preview.
- Apply a filter to a selected region.
- Create, update, and retrieve selection masks.
- Execute automatic selection.
- Manage processing pipelines.
- Retrieve operation status and progress.
- Cancel a running operation.
- Export a processed image.
- Retrieve supported model information.

Validate all input parameters on the backend, even if the frontend already validates them.

Use appropriate request and response schemas. Avoid returning huge image arrays as JSON. Use suitable binary responses, encoded image formats, or efficient transfer mechanisms.

Include clear error responses for invalid formats, unsupported parameters, missing optional dependencies, unavailable models, timeouts, and resource limits.

## 11. Security, Privacy, and Resource Management

The application should work locally and must not require cloud processing for ordinary image operations.

- Do not upload images to third-party services without explicit user consent.
- Keep optional cloud-based model integrations disabled by default.
- Validate file extensions, MIME types, and actual image contents.
- Protect against malicious or malformed image files.
- Limit upload sizes and decoded image dimensions.
- Prevent decompression bombs and excessive memory allocation.
- Use secure temporary-file handling and cleanup.
- Avoid arbitrary filesystem access through user-supplied paths.
- Restrict model downloads to trusted, explicitly configured sources.
- Do not execute uploaded content as code.
- Keep credentials and secrets outside source code.
- Document which operations require network access.
- Provide a clear explanation of any data sent outside the local machine.

For deployment, support a local development environment and a Docker-based deployment where practical.

## 12. Testing and Quality Assurance

Testing is mandatory. Do not consider a filter complete merely because it appears in the UI.

### Unit tests

Test:

- Numerical correctness of kernels.
- Mathematical formulas against actual implementations.
- Parameter validation.
- Image dimensions and channel preservation.
- Data-type conversions.
- Alpha-channel handling.
- Border behavior.
- Mask blending.
- Selection inversion and feathering.
- Frequency-domain behavior.
- Morphological operations.
- Restoration stability.
- Neural model input and output contracts.

Use small, deterministic test images with known expected results.

### Integration tests

Verify:

- Uploading an image and retrieving metadata.
- Selecting a filter and applying it.
- Changing parameters and regenerating the preview.
- Selecting a region and applying a filter only there.
- Undo and redo.
- Chaining multiple filters.
- Exporting processed images.
- Handling unavailable models and optional dependencies.
- Cancelling long-running jobs.
- Correct display of mathematical formulas and kernel values.

### Visual and functional tests

Use representative test images containing:

- Flat color regions.
- Sharp edges.
- Fine textures.
- Salt-and-pepper noise.
- Gaussian noise.
- Periodic noise.
- Transparent pixels.
- Fine hair or complex object boundaries.
- Small isolated objects.
- Large images.

Test on common desktop browsers and ensure the interface remains usable on smaller displays.

For mathematical filters, use numerical tolerances rather than requiring exact equality when floating-point calculations or library conventions legitimately differ.

## 13. Documentation

Create clear project documentation covering:

- Project overview.
- Architecture.
- Installation.
- Development setup.
- Configuration.
- Running frontend and backend.
- Docker deployment.
- Filter catalog.
- Mathematical foundations.
- Kernel-generation behavior.
- Selection and masking.
- Optional AI models.
- Supported image formats.
- Performance limitations.
- API documentation.
- Testing.
- Troubleshooting.
- Security and privacy.
- How to add a new filter.
- How to contribute and extend the registry.

Include examples demonstrating how a developer can add a filter with its implementation, parameter schema, mathematical formula, kernel generator if applicable, tests, and UI metadata.

## 14. Implementation Phases

After presenting the plan and receiving approval, implement the project in the following phases.

**Phase 1 — Foundation**

- Establish the frontend and backend architecture.
- Implement image upload, canvas rendering, image metadata, and export.
- Create the filter registry and mathematical metadata model.
- Implement the first working filters.
- Add baseline testing and documentation.

**Phase 2 — Classical filtering**

- Implement core linear filters.
- Implement nonlinear denoising filters.
- Implement edge detection.
- Implement morphology.
- Implement enhancement and color operations.
- Implement formula and kernel visualization.

**Phase 3 — Selection and masking**

- Implement manual selection tools.
- Implement Magic Wand and Color Range.
- Implement Quick Selection and edge-assisted selection.
- Implement mask editing, feathering, and inversion.
- Enable filter application to selected regions.
- Add selection-related tests.

**Phase 4 — Advanced processing**

- Add frequency-domain filters.
- Add wavelet and multiscale methods.
- Add restoration algorithms.
- Add texture and feature analysis.
- Add segmentation tools.
- Implement advanced algorithm-specific mathematical visualizations.

**Phase 5 — AI-assisted capabilities**

- Add optional subject selection and object segmentation.
- Integrate selected restoration and super-resolution models.
- Add model availability checks, loading states, and graceful fallbacks.
- Document model licensing and resource requirements.

**Phase 6 — Professional editing workflow**

- Add editable filter pipelines.
- Add undo/redo, presets, comparisons, and processing history.
- Optimize previews and large-image processing.
- Complete export workflows and user-facing error handling.

**Phase 7 — Validation and release**

- Run all unit and integration tests.
- Check every filter's implementation status.
- Validate mathematical documentation against actual computations.
- Check accessibility and browser compatibility.
- Verify installation and deployment from a clean environment.
- Finalize documentation and known limitations.

Adjust these phases when the existing codebase justifies a better sequence. Do not sacrifice correctness to meet a superficial milestone.

## 15. Acceptance Criteria

The project is acceptable only when all the following conditions are satisfied:

1. Users can upload, view, process, compare, and export images.
2. Users can search and browse the complete filter catalog.
3. Implemented filters perform real image-processing operations.
4. Every filter has an accurate mathematical description.
5. Fixed and dynamically generated kernels are displayed correctly.
6. Algorithms without fixed kernels display their appropriate mathematical representation.
7. Parameter changes update the relevant mathematical information and processing result.
8. Users can create and modify selection masks using manual and automatic tools.
9. Users can apply supported filters to selected regions without unintentionally modifying unselected pixels.
10. AI-assisted selection works when its model and dependencies are available.
11. The application remains useful without optional AI models.
12. Processing history, undo, redo, and export behave correctly.
13. Errors, unavailable dependencies, and unsupported operations are clearly reported.
14. Tests validate the actual processing implementation.
15. The project can be installed and run using documented instructions.
16. The code is modular, maintainable, and extensible.
17. The complete filter catalog distinguishes implemented functionality from planned or optional functionality.
18. No filter is falsely advertised as implemented.
19. No mathematical formula or kernel matrix is invented merely to satisfy the UI.
20. The application does not silently send user images to external services.

## 16. Final Instructions to Claude Code

Start by examining the repository and reporting your findings. Then present a practical implementation plan with architecture, dependencies, phase breakdown, risks, and acceptance criteria.

Wait for approval before changing the code.

After approval, implement the application incrementally. Prefer well-tested, established image-processing libraries over custom implementations of complex algorithms unless a custom implementation is justified.

Do not implement the entire catalog as a collection of placeholders. Build a functional core first, maintain the complete registry, and progressively add advanced capabilities.

Prioritize numerical correctness, transparent mathematical explanations, accurate kernel visualization, precise region selection, responsive interaction, and maintainable code.

At the end of every phase, run the relevant tests, report what works, identify what remains, and document any deviations from the plan.

The final result must be a usable image-processing studio and a reliable mathematical reference tool for developers, students, and image-processing practitioners.