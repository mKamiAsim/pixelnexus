# Metrics

The **Metrics** panel measures how close the active image is to a reference, with PSNR, SSIM, MSE and MAE. Open it from **Window > Metrics** or **Filter > Quality metrics**. The definitions are on the [metrics page](../filters/utility/metrics.md).

## Choose the reference

- **Original of this image**: the image as it was opened.
- **An earlier step**: any step before the current one, such as the noisy image before a denoiser ran.
- **Another open image** of the same size, such as a clean copy of a test image.

## Inside the selection

With a selection, **Only inside the selection** measures only the selected part. A pixel counts when it is at least half selected, our choice for soft edges. This shows whether a filter helped where you applied it, without the rest of the image watering the numbers down.

## Every step

**Measure every step** fills a table with the PSNR and SSIM of each history step against the reference. The current step is in bold. A step of another size, such as after a resize, shows "Other size". The table is computed when you press the button, since SSIM takes a moment on large images.

## A worked example

1. Open the Siemens star test image.
2. Apply **Add Gaussian noise**, then **Median filter**.
3. In Metrics, press **Measure every step**. Step 0 shows "Equal images". Step 1 shows the damage the noise did, and step 2 how much the median filter repaired.
4. Choose step 1 as the reference to see how far the median filter moved the image from the noisy one.
