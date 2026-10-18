# Performance

This page records the Phase 8 performance pass. The rule was to profile first and change only what the numbers point at. Every number here was printed by a script in the repository, on one computer: an AMD Ryzen 9 9950X3D (16 cores, 32 threads), an NVIDIA RTX 5090, headless Chromium 153. Your numbers will differ.

## How to measure

- `pnpm --filter @pixelnexus/web bench:filters` applies twelve browser filters to a 4096 x 4096 test image through the studio. Each uses its default values. It prints the job time that the studio measured, and the wall time from the click to the "Applied" message. Options: `--size`, `--only`.
- `pnpm --filter @pixelnexus/web bench:viewport` measures opening and panning a 6000 x 6000 image. See [Preview and rendering](preview-and-rendering.md).
- The E2E test `tests/e2e/stress.spec.ts` runs a 6000 x 6000 image through three filters, a delete with recompute and a pipeline run, and records each apply time.

## What the profile showed

The first run, with 8 workers, gave these job times on 4096 x 4096 pixels:

| Filter | Before |
|---|--:|
| Gaussian, box, weighted average, unsharp mask, Laplacian | 0.17 to 0.47 s |
| Sobel, median, opening | 0.42 to 0.52 s |
| Guided filter, Kuwahara | 0.98 to 1.07 s |
| Canny (one tile, since hysteresis spans the image) | 4.45 s |
| Bilateral | 25.0 s |

The convolutions were already fast, so they did not get a WebGL2 path. A GPU path would add a second implementation to keep equal to the first, for little gain. The bilateral filter was the clear hot spot.

A CPU profile of one apply on a 6000 x 6000 image then showed a bigger problem. The apply took 12.9 s of wall time. Only 0.4 s of it was the filter. The Metrics panel computed SSIM on the main thread for every new image, even behind another tab.

## What changed

- **Bilateral filter.** For 8-bit images, the range weights come from a table of `Math.exp` at every possible difference, and pixels away from the border read their window by fixed offsets. The numbers and their order are the same as in the plain loop, so the result is identical. Tests compare the two for every border mode and both range modes. 25.0 s became 3.8 s with 8 workers.
- **Workers.** The pool now uses up to 16 workers instead of 8, one fewer than the threads. With 32 threads, most filters became 15 to 37 percent faster. Machines with 8 threads or fewer are not affected.
- **Metrics in a worker.** PSNR, SSIM, MSE and MAE run in their own worker, and only while the Metrics panel shows. The Histogram and Spectrum panels also wait until they show.
- **Apply stops the preview at once.** A preview of the newly selected filter no longer keeps the workers busy after you press Apply.

## After

Job and wall times on 4096 x 4096 pixels, with 16 workers:

| Filter | Job | Wall |
|---|--:|--:|
| Box | 0.17 s | 0.33 s |
| Gaussian | 0.18 s | 0.34 s |
| Laplacian | 0.12 s | 0.29 s |
| Median | 0.30 s | 0.49 s |
| Unsharp mask | 0.21 s | 0.53 s |
| Kuwahara | 0.76 s | 0.92 s |
| Guided filter | 1.12 s | 1.40 s |
| Bilateral | 2.57 s | 2.86 s |
| Canny | 4.51 s | 4.89 s |

On the 6000 x 6000 stress test, each apply took 0.8 to 0.95 s. Before, it took about 12.8 s. The whole test took 10.2 s instead of 77.6 s.

## Still open

- Canny runs as one tile, since its hysteresis follows edges across the whole image.
- Tiles that are already running cannot be stopped, so an Apply right after choosing a filter can wait for the last preview tiles.
