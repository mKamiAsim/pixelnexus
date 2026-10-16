# PixelNexus catalog plan

Version 1. Created 2026-10-11.

This file classifies every filter and tool from both requirement documents. It is the scope for the build. The real catalog will live in `catalog/` as YAML. This file is the plan for it.

## How to read the tables

**Tier**

| Tier | Meaning |
|---|---|
| Core | Implemented in the main build. Most run in the browser. |
| Advanced | Implemented in the main build. Needs more work or a specialist library. |
| Optional | Needs an optional dependency or a downloadable model. |
| Planned | Kept in the catalog with status "Planned but not implemented". The reason is given. |
| Unsupported | Kept in the catalog with status "Unsupported". The reason is given. |

**Engine**

| Engine | Meaning |
|---|---|
| Browser | TypeScript in Web Workers. Works offline and on GitHub Pages. |
| Science | Local Python engine. |
| Model | ONNX model run by the science engine. |
| none | Not implemented. |

**Phase** refers to the phases in PLAN.md.

**Aliases.** When two names mean the same algorithm, there is one entry. The other names are aliases. The docs explain each alias on the main page.

**Cross-listing.** Some entries belong to two families, for example Laplacian (linear and edges). They have one primary family and appear in the other through tags.

Entry ids are final unless a later session records a change in the PLAN.md progress log.

## 1. Linear spatial filters

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| box | Box filter | Mean filter, Average filter, Per-channel box filter. Integral image, constant cost per pixel. | Core | Browser | 3 |
| gaussian | Gaussian filter | Gaussian blur, Separable Gaussian, Per-channel Gaussian. Always separable. | Core | Browser | 3 |
| weighted-average | Weighted average filter | Editable kernel with normalization. | Core | Browser | 5a |
| binomial | Binomial filter | Rows of Pascal's triangle. | Core | Browser | 5a |
| triangular | Triangular filter | Tent filter. | Core | Browser | 5a |
| disk-average | Disk averaging filter | Circular averaging filter. Defocus blur (uniform disk PSF model). Anti-aliased disk. | Core | Browser | 5a |
| motion-blur | Motion blur | Line PSF with length and angle. Anti-aliased line. | Core | Browser | 3 |
| fir-lowpass | Low-pass FIR filter | Windowed sinc design. Hamming, Hann, Blackman and Kaiser windows. Separable. | Core | Browser | 5a |
| laplacian | Laplacian | 4 and 8 neighbor variants. Sign convention shown. Cross-listed in edges. | Core | Browser | 3 |
| laplacian-sharpen | Laplacian sharpening | I minus c times the Laplacian. | Core | Browser | 5a |
| high-pass | High-pass filter | Image minus a low-pass result, with a display offset. | Core | Browser | 5a |
| high-boost | High-boost filter | A times the image minus a low-pass result. Cross-listed in enhancement. | Core | Browser | 5a |
| unsharp-mask | Unsharp mask | Unsharp masking. Cross-listed in enhancement. | Core | Browser | 3 |
| dog | Difference of Gaussians | Cross-listed in edges. | Core | Browser | 5c |
| log | Laplacian of Gaussian | Cross-listed in edges. | Core | Browser | 5c |
| gabor | Gabor filter | Real, imaginary and magnitude outputs. Cross-listed in edges and texture. | Core | Browser | 5c |
| steerable | Steerable filters | First and second derivative of Gaussian bases (Freeman and Adelson). | Core | Browser | 5c |
| wiener-denoise | Wiener filter (global) | Wiener linear filter. Frequency domain with a power spectrum estimate. No blur model. | Core | Browser | 5e |
| matched-filter | Matched filter | Matched frequency filter. Template taken from a selection. Normalized cross-correlation map. Done on 2026-10-16. | Advanced | Science | 6d |

Requirements 1 also lists the ideal and Butterworth low-pass filters here. They are the same entries as in section 5. Sobel, Prewitt, Roberts, Scharr, Kirsch and Frei-Chen are in section 7.

## 2. Nonlinear spatial filters

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| median | Median filter | Per-channel median filter. | Core | Browser | 3 |
| weighted-median | Weighted median filter | | Core | Browser | 5b |
| adaptive-median | Adaptive median filter | Window grows until the median is not an impulse. | Core | Browser | 5b |
| switching-median | Switching median filter | Replaces only pixels detected as impulses. | Core | Browser | 5b |
| vector-median | Vector median filter | Color vectors, L2 distance. | Core | Browser | 5b |
| min | Min filter | Same result as gray erosion with a flat square. Shares code. | Core | Browser | 5b |
| max | Max filter | Same result as gray dilation with a flat square. Shares code. | Core | Browser | 5b |
| midpoint | Midpoint filter | | Core | Browser | 5b |
| alpha-trimmed-mean | Alpha-trimmed mean filter | | Core | Browser | 5b |
| contraharmonic-mean | Contraharmonic mean filter | | Core | Browser | 5b |
| geometric-mean | Geometric mean filter | | Core | Browser | 5b |
| harmonic-mean | Harmonic mean filter | | Core | Browser | 5b |
| rank-order | Rank-order filter | Percentile filter. Rank given as an index or a percentile. | Core | Browser | 5b |
| mode | Mode filter | Most frequent value in the window. | Core | Browser | 5b |
| kuwahara | Kuwahara filter | | Core | Browser | 5b |
| nagao-matsuyama | Nagao-Matsuyama filter | | Core | Browser | 5b |
| bilateral | Bilateral filter | Vector bilateral filter is the color-distance mode of this entry. | Core | Browser | 5b |
| joint-bilateral | Joint bilateral filter | Guide is the image luma or another open image of the same size. | Core | Browser | 5b |
| guided | Guided filter | Box filters, linear cost. | Core | Browser | 5b |
| anisotropic-diffusion | Anisotropic diffusion | Perona-Malik. | Core | Browser | 5b |
| vector-anisotropic-diffusion | Vector anisotropic diffusion | Color version with shared diffusivity. | Core | Browser | 5b |
| domain-transform | Domain transform filter | OpenCV ximgproc. | Advanced | Science | 6f |
| rolling-guidance | Rolling guidance filter | OpenCV ximgproc. | Advanced | Science | 6f |
| nlm | Non-local means | scikit-image. | Advanced | Science | 6f |
| tv-denoise | Total variation denoising | Rudin-Osher-Fatemi (ROF). Chambolle and split Bregman solvers. | Advanced | Science | 6f |
| bm3d | BM3D | Optional `bm3d` package. License check before use. | Optional | Science | 6f |
| bm3d-lite | BM3D-inspired denoising | Simplified two-stage version. Clearly labeled as simplified. | Advanced | Science | 6f |
| susan-smoothing | SUSAN noise filter | Smith and Brady. | Advanced | Science | 6f |
| bitonic | Bitonic filter | Treece. | Advanced | Science | 6f |
| bilateral-solver | Bilateral solver | Large sparse solver. High effort for its teaching value. | Planned | none | |
| bm4d | BM4D | Needs volumetric data. PixelNexus works on 2D images. | Unsupported | none | |

## 3. Adaptive and statistical filters

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| wiener-adaptive | Adaptive Wiener filter | Wiener filter in the requirements 2 smoothing list. Local mean and variance (Lee 1980). | Core | Browser | 5b |
| adaptive-local-noise | Adaptive local noise reduction | Adaptive mean filter. Gonzalez and Woods form. | Core | Browser | 5b |
| lee | Lee filter | Speckle. | Core | Browser | 5b |
| enhanced-lee | Enhanced Lee filter | Speckle. | Core | Browser | 5b |
| kuan | Kuan filter | Speckle. | Core | Browser | 5b |
| frost | Frost filter | Speckle. | Core | Browser | 5b |
| gamma-map | Gamma-MAP filter | Speckle. | Core | Browser | 5b |
| sigma | Sigma filter | Lee sigma filter. | Core | Browser | 5b |
| srad | Speckle reducing anisotropic diffusion | SRAD (Yu and Acton). | Core | Browser | 5b |
| adaptive-smoothing | Adaptive smoothing | Saint-Marc, Chen and Medioni. | Core | Browser | 5b |
| local-variance | Local variance filter | Feature map output. | Core | Browser | 5b |
| local-std | Standard deviation filter | Feature map output. | Core | Browser | 5b |
| local-range | Range filter | Feature map output. | Core | Browser | 5b |
| local-entropy | Entropy filter | Feature map output. | Core | Browser | 5b |
| mad-outlier | Median absolute deviation thresholding | Marks or repairs pixels far from the local median. | Core | Browser | 5b |
| savgol | Savitzky-Golay filter | Regression-based filters. Local polynomial fit. Has a fixed kernel. | Core | Browser | 5b |
| m-estimator | Robust M-estimator filter | Huber and Tukey weights, iteratively reweighted. | Advanced | Science | 6f |
| steering-kernel | Steering kernel regression | Takeda, Farsiu and Milanfar. | Advanced | Science | 6f |
| ransac-surface | RANSAC surface fit | RANSAC-based robust estimation. Fits a background surface and removes it. | Advanced | Science | 6f |
| lms-2d | LMS adaptive filter | Needs a reference signal. A 2D LMS predictor may be added later with an honest label. | Planned | none | |
| rls-2d | RLS adaptive filter | Same reason as LMS. | Planned | none | |
| kalman | Kalman filter | Needs a state model and an image sequence. A reduced update Kalman filter may be added later. | Planned | none | |
| particle | Particle filter | A sequential tracking method. It has no meaningful still-image form. | Unsupported | none | |

## 4. Morphological filters

All morphology entries share a structuring-element editor: rectangle, ellipse, disk, cross, diamond, line with angle and length, and custom. Size, iterations, connectivity and border mode are adjustable where they apply. Binary and grayscale images are both supported.

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| erosion | Erosion | | Core | Browser | 5d |
| dilation | Dilation | | Core | Browser | 5d |
| opening | Opening | | Core | Browser | 5d |
| closing | Closing | | Core | Browser | 5d |
| morph-gradient | Morphological gradient | Beucher gradient. Cross-listed in edges. | Core | Browser | 5d |
| internal-gradient | Internal gradient | | Core | Browser | 5d |
| external-gradient | External gradient | | Core | Browser | 5d |
| tophat | Top-hat | White top-hat. | Core | Browser | 5d |
| blackhat | Black-hat | Bottom-hat. | Core | Browser | 5d |
| hit-or-miss | Hit-or-miss transform | Editor for the pair of elements. | Core | Browser | 5d |
| thinning | Thinning | Zhang-Suen and Guo-Hall. | Core | Browser | 5d |
| thickening | Thickening | | Core | Browser | 5d |
| skeleton | Skeletonization | | Core | Browser | 5d |
| pruning | Pruning | Spur removal. | Core | Browser | 5d |
| convex-hull | Convex hull | Per object. | Core | Browser | 5d |
| reconstruction | Morphological reconstruction | By dilation and by erosion. Cross-listed in segmentation. | Core | Browser | 5d |
| opening-by-reconstruction | Opening by reconstruction | | Core | Browser | 5d |
| closing-by-reconstruction | Closing by reconstruction | | Core | Browser | 5d |
| geodesic | Geodesic filtering | Geodesic dilation and erosion with a marker. | Core | Browser | 5d |
| asf | Alternating sequential filter | | Core | Browser | 5d |
| leveling | Morphological leveling | | Core | Browser | 5d |
| ccl-filter | Connected-component filtering | Keep components by area range. | Core | Browser | 5d |
| medial-axis | Medial axis | scikit-image, with distance values. | Advanced | Science | 6f |
| attribute-opening | Attribute opening | Area and diameter attributes. Max-tree. | Advanced | Science | 6f |
| area-opening | Area opening | Max-tree. | Advanced | Science | 6f |
| area-closing | Area closing | Max-tree. | Advanced | Science | 6f |

## 5. Frequency-domain filters

All browser entries use the mixed-radix FFT from Phase 5e. The Spectrum panel shows the spectrum and the filter response.

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| ideal-lowpass | Ideal low-pass | | Core | Browser | 5e |
| ideal-highpass | Ideal high-pass | | Core | Browser | 5e |
| ideal-bandpass | Ideal band-pass | | Core | Browser | 5e |
| ideal-bandreject | Ideal band-reject | Band-stop filter. | Core | Browser | 5e |
| butterworth-lowpass | Butterworth low-pass | | Core | Browser | 5e |
| butterworth-highpass | Butterworth high-pass | | Core | Browser | 5e |
| butterworth-bandpass | Butterworth band-pass | | Core | Browser | 5e |
| butterworth-bandreject | Butterworth band-reject | | Core | Browser | 5e |
| gaussian-lowpass | Gaussian low-pass | | Core | Browser | 5e |
| gaussian-highpass | Gaussian high-pass | | Core | Browser | 5e |
| gaussian-bandpass | Gaussian band-pass | | Core | Browser | 5e |
| gaussian-bandreject | Gaussian band-reject | | Core | Browser | 5e |
| notch-reject | Notch-reject | Notch filter. Click to place notches on the spectrum. | Core | Browser | 5e |
| notch-pass | Notch-pass | | Core | Browser | 5e |
| comb | Comb filter | Notches at harmonics. | Core | Browser | 5e |
| homomorphic | Homomorphic filter | Cross-listed in enhancement. | Core | Browser | 5e |
| phase-only | Phase-only filter | Keeps phase, sets magnitude to one. | Core | Browser | 5e |
| spectral-whitening | Spectral whitening | | Core | Browser | 5e |
| periodic-noise | Periodic-noise suppression | Finds spectral peaks, then applies notches. | Core | Browser | 5e |
| log-gabor | Log-Gabor filter | Cross-listed in texture. | Core | Browser | 5e |
| radon-filter | Radon and Fourier slice filtering | Sinogram, ramp filter, filtered back projection. | Advanced | Science | 6b |
| directional-curvelet | Curvelet-inspired directional filter | Wedge masks in polar frequency tiles. Not a true curvelet transform. | Advanced | Science | 6b |
| directional-shearlet | Shearlet-inspired directional filter | Sheared frequency masks. Not a true shearlet transform. | Advanced | Science | 6b |

Inverse, constrained least-squares and Wiener deconvolution filters are in section 10.

## 6. Wavelet and multiscale filters

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| wavelet-threshold | Wavelet thresholding | One entry with presets. Aliases: Wavelet shrinkage denoising, Haar wavelet thresholding, Daubechies, Symlet and Coiflet wavelet filtering, Wavelet hard thresholding, Wavelet soft thresholding, VisuShrink, BayesShrink, SureShrink. SureShrink is our own SURE threshold code. Filter taps come from PyWavelets. | Advanced | Science | 6b |
| swt-denoise | Stationary wavelet filtering | Undecimated transform and cycle spinning. | Advanced | Science | 6b |
| wavelet-wiener | Wavelet Wiener filtering | | Advanced | Science | 6b |
| dtcwt-denoise | Dual-tree complex wavelet filtering | Optional `dtcwt` package. Checked on 2026-10-15: dtcwt 0.14.0 requires NumPy below 2, so the entry stays Planned. | Optional | Science | 6b |
| ridgelet | Ridgelet filtering | Radon plus 1D wavelet. Labeled as an approximation. | Advanced | Science | 6b |
| steerable-pyramid | Steerable pyramid filters | Optional `pyrtools` (MIT). Checked on 2026-10-15: pyrtools 1.0.11 works with NumPy 2. Done on 2026-10-15 as optional-dependency. Cross-listed in texture. | Optional | Science | 6b |
| laplacian-pyramid | Laplacian pyramid filtering | Per-level gains. | Core | Browser | 5e |
| gaussian-pyramid | Gaussian pyramid filtering | | Core | Browser | 5e |
| scale-space | Scale-space filtering | Gaussian scale-space stack and normalized derivatives. | Core | Browser | 5e |
| curvelet | Curvelet filtering | CurveLab is not openly licensed. The curvelet-inspired filter is available. | Planned | none | |
| contourlet | Contourlet filtering | No maintained library. Large custom effort. | Planned | none | |
| nsct | Non-subsampled contourlet filtering | Same reason as contourlet. | Planned | none | |
| shearlet | Shearlet filtering | pyShearLab license to check. The shearlet-inspired filter is available. | Planned | none | |
| multires-diffusion | Multiresolution diffusion | Definitions vary in the literature. A documented variant may be added later. | Planned | none | |

## 7. Edge detection and boundary analysis

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| sobel | Sobel | Sobel X and Y. Outputs Gx, Gy, magnitude and direction. | Core | Browser | 3 |
| prewitt | Prewitt | Prewitt X and Y. | Core | Browser | 5c |
| roberts | Roberts Cross | | Core | Browser | 5c |
| scharr | Scharr | Scharr X and Y. Scharr-based sharpening is a mode of this entry. | Core | Browser | 5c |
| kirsch | Kirsch compass | Eight directions. | Core | Browser | 5c |
| robinson | Robinson compass | | Core | Browser | 5c |
| frei-chen | Frei-Chen | Nine basis masks. Edge and line subspace projection. | Core | Browser | 5c |
| farid-simoncelli | Farid-Simoncelli derivative filter | Coefficients checked against scikit-image. | Core | Browser | 5c |
| sobel-nms | Sobel with non-maximum suppression | | Core | Browser | 5c |
| canny | Canny | All five stages visible. L1 and L2 norms. | Core | Browser | 5c |
| marr-hildreth | Marr-Hildreth | LoG with zero crossings. | Core | Browser | 5c |
| zero-crossing | Zero-crossing detector | | Core | Browser | 5c |
| hysteresis | Hysteresis thresholding | Works on any response map. | Core | Browser | 5c |
| deriche | Deriche | OpenCV ximgproc gradients. | Advanced | Science | 6f |
| shen-castan | Shen-Castan | ISEF filter. | Advanced | Science | 6f |
| susan-edge | SUSAN edge detector | | Advanced | Science | 6f |
| phase-congruency | Phase congruency | Kovesi method with log-Gabor filters. Cross-listed in texture. Our own code after phasecong3. Done on 2026-10-16. | Advanced | Science | 6d |
| hough-linking | Hough-based edge linking | Canny then probabilistic Hough. Done on 2026-10-16. | Advanced | Science | 6d |
| structured-edge | Structured Edge Detector | Needs a downloaded model file. License check first. | Optional | Science | 6d |

Laplacian, LoG, DoG and the morphological gradient are cross-listed here from their own families.

## 8. Texture, corners, blobs and features

Detectors produce overlays, keypoints, orientations and scores. They do not pretend to be photo filters.

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| gabor-bank | Gabor filter bank | Gabor wavelet bank. Several scales and orientations. | Core | Browser | 5c |
| laws | Laws' texture energy filters | Fixed 5-tap vectors. | Core | Browser | 5c |
| line-detector | Line detectors | Horizontal, vertical and diagonal masks. Prewitt and Sobel line masks. Laplacian-based line detector. Oriented line filters. | Core | Browser | 5c |
| matched-vessel | Matched vessel filter | Chaudhuri et al. Gaussian profile kernels in 12 directions. | Core | Browser | 5c |
| harris | Harris corner detector | | Core | Browser | 5c |
| shi-tomasi | Shi-Tomasi | | Core | Browser | 5c |
| moravec | Moravec corner detector | | Core | Browser | 5c |
| fast | FAST | With non-maximum suppression. | Core | Browser | 5c |
| lbp | Local Binary Pattern | scikit-image. Done on 2026-10-16. | Advanced | Science | 6d |
| ltp | Local Ternary Pattern | Our own code on the 8 neighbors. Done on 2026-10-16. | Advanced | Science | 6d |
| glcm | GLCM features | Global table and an optional sliding-window map. Done on 2026-10-16. | Advanced | Science | 6d |
| hog | Histogram of Oriented Gradients | With visualization. Done on 2026-10-16. | Advanced | Science | 6d |
| frangi | Frangi vesselness | Ridge filters are cross-listed here. Done on 2026-10-15. | Advanced | Science | 6d |
| sato | Sato filter | Done on 2026-10-15. | Advanced | Science | 6d |
| meijering | Meijering filter | Done on 2026-10-15. | Advanced | Science | 6d |
| hessian | Hessian-based filter | Hybrid Hessian filter of scikit-image. Done on 2026-10-15. | Advanced | Science | 6d |
| blob-log | LoG blob detection | Done on 2026-10-15. | Advanced | Science | 6d |
| blob-dog | DoG blob detection | DoG keypoint detection. Done on 2026-10-15. | Advanced | Science | 6d |
| blob-doh | Determinant of Hessian | Done on 2026-10-15. | Advanced | Science | 6d |
| sift | SIFT | SIFT-inspired scale-space keypoints. OpenCV. Done on 2026-10-15. | Advanced | Science | 6d |
| surf-inspired | SURF-inspired detector | Fast-Hessian with box filters. Our own code. Real SURF is non-free in OpenCV and not shipped. Done on 2026-10-15. | Advanced | Science | 6d |
| orb | ORB | ORB-inspired binary features. OpenCV. Done on 2026-10-15. | Advanced | Science | 6d |
| brisk | BRISK | Extra. OpenCV. Done on 2026-10-15. | Advanced | Science | 6d |
| akaze | AKAZE | Extra. OpenCV. Done on 2026-10-15. | Advanced | Science | 6d |
| susan-corner | SUSAN corner detector | Our own code, without the false-corner tests of the paper. Done on 2026-10-15. | Advanced | Science | 6d |
| mser | MSER region detector | OpenCV. Regions as centroid, equal-area radius and long axis. Done on 2026-10-15. | Advanced | Science | 6d |
| hough-lines | Hough transform for lines | Accumulator view. Done on 2026-10-16. | Advanced | Science | 6d |
| hough-circles | Hough transform for circles | Accumulator view. Done on 2026-10-16. | Advanced | Science | 6d |

Log-Gabor, phase congruency and the steerable pyramid are cross-listed here.

## 9. Enhancement, illumination and color

The groups below follow requirements 1: point operations, color transformations, local filters and illumination estimation are kept apart.

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| gamma | Gamma correction | Point operation. | Core | Browser | 3 |
| log-transform | Log transformation | Point operation. | Core | Browser | 5f |
| contrast-stretch | Contrast stretching | Point operation. | Core | Browser | 5f |
| percentile-normalize | Percentile normalization | Point operation. | Core | Browser | 5f |
| invert | Invert | Extra. Point operation. | Core | Browser | 5f |
| histogram-eq | Histogram equalization | Global. | Core | Browser | 5f |
| ahe | Adaptive histogram equalization | CLAHE without a clip limit. | Core | Browser | 5f |
| clahe | CLAHE | Tile grid, clip limit, bilinear blending. Checked against OpenCV. | Core | Browser | 5f |
| grayscale | Grayscale conversion | Luma BT.709 by default, luminance option. | Core | Browser | 3 |
| bw-mix | Black-and-white conversion | Custom channel weights. | Core | Browser | 5f |
| sepia | Sepia | Cross-listed in artistic. | Core | Browser | 5f |
| saturation | Saturation adjustment | | Core | Browser | 5f |
| vibrance | Vibrance | | Core | Browser | 5f |
| hue-rotate | Hue rotation | | Core | Browser | 5f |
| hsv-adjust | Hue, saturation and value adjustment | | Core | Browser | 5f |
| channel-mixer | Channel mixer | | Core | Browser | 5f |
| color-balance | Color balance | Shadows, midtones and highlights. | Core | Browser | 5f |
| temperature-tint | Temperature and tint | | Core | Browser | 5f |
| white-balance | White balance | Pick a neutral point. | Core | Browser | 5f |
| gray-world | Gray-world correction | | Core | Browser | 5f |
| white-patch | White-patch correction | Max-RGB and percentile versions. | Core | Browser | 5f |
| chromatic-adaptation | Chromatic adaptation | Von Kries and Bradford. | Core | Browser | 5f |
| retinex-ssr | Single-scale Retinex | The "Retinex" name is an overview alias that links SSR, MSR and MSRCR. | Core | Browser | 5f |
| retinex-msr | Multi-scale Retinex | | Core | Browser | 5f |
| msrcr | Multi-scale Retinex with color restoration | Retinex-based color enhancement. | Core | Browser | 5f |
| bilateral-tonemap | Bilateral tone mapping | Durand and Dorsey. | Core | Browser | 5f |
| detail-enhance | Detail enhancement | Bilateral or guided detail enhancement. Splits base and detail layers, then boosts detail. | Core | Browser | 5f |
| chroma-denoise | Chroma denoising | Denoises chroma only. | Core | Browser | 5f |
| demosaic | Demosaicing | Simulates a Bayer mosaic, then demosaics (bilinear and Malvar-He-Cutler). | Core | Browser | 5f |
| color-threshold | Color threshold | Binary output from HSV ranges. | Core | Browser | 5f |
| local-laplacian | Local Laplacian filtering | | Advanced | Science | 6f |
| tone-mapping | Tone mapping | Reinhard, Drago and Mantiuk through OpenCV. | Advanced | Science | 6f |

**Workflow options, not separate filters.** Luminance-only filtering, color-space filtering and per-channel filtering are a "Channel scope" option on every filter that supports it: RGB, per channel, luminance only, chroma only. They are built in Phase 3 and documented as options.

Homomorphic filtering, unsharp masking and high-boost filtering are cross-listed here.

## 10. Restoration and reconstruction

Restoration never claims to recover information the input does not contain. Each page states whether it is exact under a known model, approximate, or learned.

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| inverse-filter | Inverse filtering | With a cutoff radius. | Core | Browser | 5e |
| wiener-deconv | Wiener deconvolution | Wiener restoration, Wiener frequency filter. Presets: motion deblurring, defocus deblurring. | Core | Browser | 5e |
| cls | Constrained least squares | | Core | Browser | 5e |
| tikhonov | Tikhonov regularization | | Core | Browser | 5e |
| richardson-lucy | Richardson-Lucy | Lucy-Richardson deconvolution. Non-blind deconvolution overview links here. | Core | Browser | 5e |
| regularized-rl | Regularized Richardson-Lucy | TV regularization (Dey et al.). | Core | Browser | 5e |
| landweber | Landweber iteration | | Core | Browser | 5e |
| nnls-deconv | Non-negative least-squares deconvolution | Projected Landweber. Labeled with its method. | Core | Browser | 5e |
| dead-pixel | Dead-pixel correction | Outlier against the local median, then repair. | Core | Browser | 5b |
| tv-deblur | Total variation restoration | Chambolle-Pock primal-dual. Done on 2026-10-15. | Advanced | Science | 6c |
| blind-deconv | Blind deconvolution | Alternating Richardson-Lucy. Labeled experimental. Done on 2026-10-15. | Advanced | Science | 6c |
| sparse-fista | Sparse regularization | FISTA with a wavelet L1 prior. Done on 2026-10-15. | Advanced | Science | 6c |
| pnp-admm | Plug-and-play restoration | ADMM with a choice of denoiser. Done on 2026-10-15. | Advanced | Science | 6c |
| red | Regularization by Denoising | RED. Done on 2026-10-15. | Advanced | Science | 6c |
| inpaint | Image inpainting | Telea, Navier-Stokes and biharmonic. The selection is the mask. Done on 2026-10-15. | Advanced | Science | 6c |
| sr-classical | Super-resolution reconstruction | Bicubic plus iterative back-projection. Changes image size. Done on 2026-10-15. | Advanced | Science | 6c |
| deband | Debanding | Done on 2026-10-15. | Advanced | Science | 6c |
| descreen | Descreening | Halftone peak removal in frequency. Done on 2026-10-15. | Advanced | Science | 6c |
| deblock | Deblocking | Done on 2026-10-15. | Advanced | Science | 6c |
| dering | Deringing | Edge-aware smoothing near strong edges. Approximate. Done on 2026-10-15. | Advanced | Science | 6c |
| jpeg-cleanup | JPEG artifact removal (classical) | Deblock plus dering. The learned version is in section 12. Done on 2026-10-15. | Advanced | Science | 6c |
| dehaze | Dehazing | Dark channel prior with guided filter refinement. Done on 2026-10-15. | Advanced | Science | 6c |

## 11. Segmentation and region-based processing

Outputs include overlays, label maps, region statistics, object counts and mask export. Any label map can become a selection.

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| threshold-global | Global threshold | Manual threshold. | Core | Browser | 5f |
| otsu | Otsu threshold | | Core | Browser | 5f |
| threshold-adaptive-mean | Adaptive mean threshold | | Core | Browser | 5f |
| threshold-adaptive-gaussian | Adaptive Gaussian threshold | | Core | Browser | 5f |
| sauvola | Sauvola threshold | | Core | Browser | 5f |
| niblack | Niblack threshold | | Core | Browser | 5f |
| wolf | Wolf threshold | | Core | Browser | 5f |
| bradley | Bradley threshold | | Core | Browser | 5f |
| region-growing | Region growing | | Core | Browser | 5f |
| kmeans-color | K-means color segmentation | | Core | Browser | 5f |
| ccl | Connected-component labeling | Labels and statistics. | Core | Browser | 5f |
| multi-otsu | Multi-level Otsu | Extra. Done on 2026-10-16. | Advanced | Science | 6e |
| watershed | Watershed | Markers from h-minima. Done on 2026-10-16. | Advanced | Science | 6e |
| marker-watershed | Marker-controlled watershed | Markers from the selection or scribbles. Done on 2026-10-16. | Advanced | Science | 6e |
| graph-cut | Graph cuts | Binary, with seeds. SciPy maximum flow. | Advanced | Science | 6e |
| grabcut | GrabCut | GrabCut-inspired interactive segmentation. OpenCV. | Advanced | Science | 6e |
| random-walker | Random walker | | Advanced | Science | 6e |
| mean-shift | Mean shift | Mean-shift segmentation. Done on 2026-10-16. | Advanced | Science | 6e |
| slic | SLIC superpixels | Done on 2026-10-16. | Advanced | Science | 6e |
| felzenszwalb | Felzenszwalb-Huttenlocher segmentation | Felzenszwalb graph-based segmentation. Done on 2026-10-16. | Advanced | Science | 6e |
| quickshift | Quickshift | Extra. Done on 2026-10-16. | Advanced | Science | 6e |
| active-contour | Active contours | Snakes. Starts from the selection boundary. | Advanced | Science | 6e |
| level-set | Level sets | Morphological geodesic active contour. | Advanced | Science | 6e |
| chan-vese | Chan-Vese segmentation | | Advanced | Science | 6e |
| split-merge | Split-and-merge segmentation | Quadtree. Done on 2026-10-16. | Advanced | Science | 6e |
| crf | Conditional Random Fields | The common Python package is unmaintained. Revisit later. | Planned | none | |

Morphological reconstruction is cross-listed here from section 4.

## 12. Deep learning and learned processing

Every model is checked for license, size and source before it enters `catalog/models.yaml`. You approve the list in Phase 7 before anything is downloaded. Models marked "check" below have a license that is still to be confirmed.

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| dncnn | DnCNN | CNN denoiser. DnCNN-based deblocking is a model variant. | Optional | Model | 7 |
| ffdnet | FFDNet | Noise level as an input. | Optional | Model | 7 |
| swinir | SwinIR | Denoising, JPEG and super-resolution variants. Transformer-based denoising alias. | Optional | Model | 7 |
| real-esrgan | Real-ESRGAN | Super-resolution. | Optional | Model | 7 |
| srcnn | SRCNN | Three layers. Good for teaching. Weights license: check. | Optional | Model | 7 |
| edsr | EDSR | Super-resolution. | Optional | Model | 7 |
| nafnet | NAFNet | Denoising and deblurring. | Optional | Model | 7 |
| restormer | Restormer | License: check. Attention-based restoration alias. | Optional | Model | 7 |
| fast-style | Neural style and texture filters | Fast neural style models. License: check. | Optional | Model | 7 |
| learned-edges | Learned edge detector | HED or PiDiNet. License: check. | Optional | Model | 7 |
| low-light | Neural relighting and enhancement | Zero-DCE family. License: check. | Optional | Model | 7 |
| mprnet | MPRNet | Overlaps with NAFNet and Restormer. Added only if there is a clear reason. | Planned | none | |
| noise2noise | Noise2Noise | A training method. Needs a training loop on your own data. | Planned | none | |
| noise2void | Noise2Void | A training method. Same reason. | Planned | none | |
| deep-image-prior | Deep Image Prior | Trains a network per image. Slow, needs PyTorch. | Planned | none | |
| diffusion-restoration | Diffusion-based restoration | Very large models. | Planned | none | |
| diffusion-sr | Diffusion-based super-resolution | Very large models. | Planned | none | |
| learned-deconvolution | Learned deconvolution | A family of methods, not one model. | Planned | none | |
| unet | U-Net | An architecture used inside other models. Docs explain it and link the models that use it. | Unsupported | none | |
| neural-bilateral | Neural bilateral filters | A design idea, not a runnable filter. Explained in the docs. | Unsupported | none | |
| dynamic-filter-net | Dynamic filter networks | A design idea, not a runnable filter. Explained in the docs. | Unsupported | none | |
| deformable-conv | Deformable convolution | A layer type, not a filter. Explained in the docs. | Unsupported | none | |

AI selection models, also Phase 7:

| ID | Name | Notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| ai-click-select | Click-to-select segmentation | SAM-family model (SAM 2.1 small sizes, MobileSAM or EfficientSAM). Also powers AI Object Selection with a box prompt. | Optional | Model | 7 |
| ai-subject | Subject selection | Salient object model (BiRefNet or IS-Net). Background selection is its inverse. | Optional | Model | 7 |
| ai-matting | Edge and hair refinement | Matting model. License: check. A classical guided-filter refinement is always available. | Optional | Model | 7 |

Every AI entry above can run through any provider kind in PLAN.md section 3.11: engine model, on-device model, remote PixelNexus engine or external AI API.

**Small on-device candidates.** These are suggestions for the browser and the phone app. Nothing downloads without your action. Sizes are approximate and every license is checked again in Phase 7b before use.

| Task | Candidate | Approximate size | License to confirm |
|---|---|---|---|
| Subject and background | U2-Net small (u2netp) | about 5 MB | Apache 2.0 |
| Portrait subject with soft edges | MODNet | about 25 MB | Apache 2.0 |
| Click and box selection | MobileSAM, EfficientSAM-Ti or SlimSAM | about 10 to 40 MB | Apache 2.0 |
| Denoising | DnCNN, FFDNet | about 2 to 4 MB | check per weights |
| Super-resolution | Real-ESRGAN compact (realesr-general-x4v3) | about 5 MB | BSD 3-Clause |
| Super-resolution, for teaching | SRCNN or FSRCNN | under 1 MB | check per weights |

Larger models (SAM 2.1 base, BiRefNet, SwinIR, full Real-ESRGAN) stay desktop or external only.

## 13. Artistic and geometric effects

| ID | Name | Aliases and notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| emboss | Emboss | Fixed kernel. | Core | Browser | 5f |
| outline | Outline | Fixed kernel. | Core | Browser | 5f |
| edge-enhance | Edge enhance | Fixed kernel. | Core | Browser | 5f |
| posterize | Posterize | | Core | Browser | 5f |
| solarize | Solarize | | Core | Browser | 5f |
| vignette | Vignette | | Core | Browser | 5f |
| oil-painting | Oil-painting effect | Intensity histogram method. | Core | Browser | 5f |
| pencil-sketch | Pencil sketch | | Core | Browser | 5f |
| cartoon | Cartoon effect | Bilateral smoothing with an edge mask. | Core | Browser | 5f |
| bloom | Bloom and glow | | Core | Browser | 5f |
| halftone | Halftone | | Core | Browser | 5f |
| dithering | Dithering | Floyd-Steinberg, Atkinson and Bayer ordered. | Core | Browser | 5f |
| pixelate | Pixelate | | Core | Browser | 5f |
| fisheye | Fisheye distortion | | Core | Browser | 5f |
| barrel | Barrel distortion | | Core | Browser | 5f |
| pincushion | Pincushion distortion | | Core | Browser | 5f |
| swirl | Swirl distortion | | Core | Browser | 5f |
| ripple | Ripple distortion | | Core | Browser | 5f |
| wave | Wave distortion | | Core | Browser | 5f |
| bokeh | Bokeh blur | Disk blur in linear light with highlight boost. | Core | Browser | 5f |
| tilt-shift | Tilt-shift blur | | Core | Browser | 5f |

## 14. Utilities (extras)

| ID | Name | Notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| noise-gaussian | Add Gaussian noise | Noise lab. | Core | Browser | 3 |
| noise-salt-pepper | Add salt-and-pepper noise | Noise lab. | Core | Browser | 3 |
| noise-speckle | Add speckle noise | Noise lab. | Core | Browser | 5b |
| noise-poisson | Add Poisson noise | Noise lab. | Core | Browser | 5b |
| noise-periodic | Add periodic noise | Noise lab. | Core | Browser | 5e |
| degrade-blur | Apply a known blur | Motion, defocus or Gaussian PSF, kept for restoration demos. | Core | Browser | 5e |
| metrics | Quality metrics | PSNR, SSIM, MSE and MAE. | Core | Browser | 5b |
| crop | Crop | Crop to selection or a set size. | Core | Browser | 2 |
| rotate-flip | Rotate and flip | 90 degree steps and mirror. | Core | Browser | 2 |
| resize | Resize | Nearest, bilinear, bicubic and Lanczos. | Core | Browser | 5a |
| rotate-free | Free rotation | Any angle, with interpolation choice. | Core | Browser | 5a |

## 15. Selection tools

These are tools, not filters. They live in `catalog/tools/` and have Learn entries.

| ID | Name | Notes | Tier | Engine | Phase |
|---|---|---|---|---|---|
| marquee-rect | Rectangular marquee | | Core | Browser | 4 |
| marquee-ellipse | Elliptical marquee | | Core | Browser | 4 |
| lasso | Freehand lasso | | Core | Browser | 4 |
| lasso-polygon | Polygonal lasso | | Core | Browser | 4 |
| lasso-magnetic | Magnetic lasso | Live wire on gradient cost. | Core | Browser | 4 |
| brush-select | Selection brush | | Core | Browser | 4 |
| eraser-select | Selection eraser | | Core | Browser | 4 |
| magic-wand | Magic Wand | | Core | Browser | 4 |
| color-range | Color Range | | Core | Browser | 4 |
| select-brightness | Select by brightness | | Core | Browser | 4 |
| select-hsv | Select by hue and saturation | | Core | Browser | 4 |
| quick-selection | Quick Selection | SLIC superpixels and similarity growth. | Core | Browser | 4 |
| edge-assisted | Edge-assisted selection | Snaps to nearby edges. | Core | Browser | 4 |
| subject-heuristic | Subject selection (classical) | Saliency, center prior, edges, color clusters. | Core | Browser | 4 |
| background-heuristic | Background selection (classical) | Inverse of the subject mask, with corrections. | Core | Browser | 4 |
| object-select-classical | Object selection (classical) | Box to GrabCut. | Advanced | Science | 6e |
| click-select-classical | Click-to-select (classical) | Positive and negative seeds to random walker. | Advanced | Science | 6e |
| ai-click-select, ai-subject, ai-matting | AI selection | See section 12. | Optional | Model | 7 |

Selection operations, all Core, Browser, Phase 4: new, add, subtract, intersect, invert, select all, deselect, disable for a while, feather, grow, shrink, smooth, border, from alpha, from luminance, named masks, save and load.

## 16. Totals

Counts cover every row in sections 1 to 15. Aliases and the pointer row for AI selection in section 15 are not counted. Selection operations are not counted.

| Tier | Engine | Count |
|---|---|---|
| Core | Browser | 218 |
| Advanced | Science | 78 |
| Optional | Science (optional package) | 4 |
| Optional | Model | 14 |
| Planned | none | 17 |
| Unsupported | none | 6 |
| **Total entries** | | **337** |

Every name in both requirement documents maps to an entry above, either by its own row or as an alias. Phase 9 adds an automated check of this mapping.

One exception: the Nevatia-Babu edge detector was removed on 2026-10-13 by the owner's decision. Its six masks could not be checked against the original paper, and the method sees little use today.
