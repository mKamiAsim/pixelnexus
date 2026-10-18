"""Reference results for the Retinex filters of Phase 5f.

tools/fixtures_impulse.py adds these color cases to web/tests/fixtures/filters.json. They follow
Petro, Sbert and Morel, "Multiscale Retinex" (IPOL 2014, DOI 10.5201/ipol.2014.107):

- The Gaussian is their Algorithm 3: the image is mirrored into a 2H x 2W grid, its 2D FFT is
  multiplied by the Fourier transform of the Gaussian, and the result is cropped. The browser
  code does the same on rows and then columns, so these cases also check that the two agree.
  Before the cases are written, the blur is checked against scipy.ndimage.gaussian_filter with
  the reflect mode, which mirrors the same way.
- Simplest Color Balance follows the sorting method of Limare and colleagues (IPOL 2011).
- Logs are taken of I + 1, and a result with a spread of at most 1e-9 becomes 127.5
  (PixelNexus's own rules).
"""

from __future__ import annotations

import math
from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

MIN_SPREAD = 1e-9


def mirror_gaussian(plane: FloatArray, sigma: float) -> FloatArray:
    h, w = plane.shape
    top = np.concatenate([plane, plane[:, ::-1]], axis=1)
    grid = np.concatenate([top, top[::-1, :]], axis=0)
    fy = np.fft.fftfreq(2 * h)[:, None]
    fx = np.fft.fftfreq(2 * w)[None, :]
    gains = np.exp(-2 * math.pi**2 * sigma**2 * (fx**2 + fy**2))
    return np.asarray(np.real(np.fft.ifft2(np.fft.fft2(grid) * gains))[:h, :w])


def multiscale_retinex(plane: FloatArray, sigmas: tuple[float, ...]) -> FloatArray:
    shifted = plane + 1
    out = np.zeros_like(plane)
    for sigma in sigmas:
        out += (np.log(shifted) - np.log(mirror_gaussian(shifted, sigma))) / len(sigmas)
    return out


def simplest_color_balance(values: FloatArray, low: float, high: float) -> FloatArray:
    flat = np.sort(values.reshape(-1))
    n = flat.size
    lo = min(n - 1, max(0, math.floor(n * low / 100)))
    hi = min(n - 1, max(lo, math.floor(n * (100 - high) / 100) - 1))
    vmin, vmax = float(flat[lo]), float(flat[hi])
    if not vmax - vmin > MIN_SPREAD:
        return np.full_like(values, 127.5)
    return (np.clip(values, vmin, vmax) - vmin) * 255 / (vmax - vmin)


def retinex(
    image: FloatArray, sigmas: tuple[float, ...], apply: str, low: float, high: float
) -> FloatArray:
    if apply == "channels":
        return np.stack(
            [
                simplest_color_balance(multiscale_retinex(image[..., c], sigmas), low, high)
                for c in range(3)
            ],
            axis=-1,
        )
    intensity = image.sum(axis=-1) / 3
    balanced = simplest_color_balance(multiscale_retinex(intensity, sigmas), low, high)
    top = image.max(axis=-1)
    with np.errstate(divide="ignore", invalid="ignore"):
        a = np.where((intensity > 0) & (top > 0), np.minimum(255 / top, balanced / intensity), 0.0)
    return image * a[..., None]


def msrcr(
    image: FloatArray, sigmas: tuple[float, ...], alpha: float, low: float, high: float
) -> FloatArray:
    total = (image + 1).sum(axis=-1)
    out = []
    for c in range(3):
        crf = np.log(alpha * (image[..., c] + 1)) - np.log(total)
        restored = multiscale_retinex(image[..., c], sigmas) * crf
        out.append(simplest_color_balance(restored, low, high))
    return np.stack(out, axis=-1)


def _check_blur_against_scipy(image: FloatArray) -> None:
    plane = image[..., 1]
    for sigma in (2.0, 3.5, 7.0):
        ours = mirror_gaussian(plane, sigma)
        theirs = ndimage.gaussian_filter(plane, sigma, mode="reflect", truncate=12.0)
        if not np.allclose(ours, theirs, rtol=0, atol=1e-6):
            raise SystemExit(f"Retinex blur: gaussian_filter disagrees for sigma {sigma}")


def add_retinex_cases(image: FloatArray, add: Add) -> None:
    _check_blur_against_scipy(image)
    source = "NumPy, the algorithms of Petro, Sbert and Morel (IPOL 2014)"
    for sigma, apply, low, high in (
        (3.0, "channels", 1.0, 1.0),
        (80.0, "channels", 0.0, 0.0),
        (5.0, "intensity", 2.0, 1.0),
    ):
        add(
            "retinex-ssr",
            {"sigma": sigma, "apply": apply, "clipLow": low, "clipHigh": high},
            retinex(image, (sigma,), apply, low, high),
            source,
        )
    for sigmas, apply, low, high in (
        ((15.0, 80.0, 250.0), "channels", 1.0, 1.0),
        ((2.0, 6.0, 20.0), "intensity", 1.0, 1.0),
        ((2.0, 6.0, 20.0), "channels", 5.0, 0.5),
    ):
        params = {"sigma1": sigmas[0], "sigma2": sigmas[1], "sigma3": sigmas[2]}
        add(
            "retinex-msr",
            {**params, "apply": apply, "clipLow": low, "clipHigh": high},
            retinex(image, sigmas, apply, low, high),
            source,
        )
    for sigmas, alpha, low, high in (
        ((15.0, 80.0, 250.0), 125.0, 1.0, 1.0),
        ((2.0, 6.0, 20.0), 60.0, 2.0, 2.0),
    ):
        params = {"sigma1": sigmas[0], "sigma2": sigmas[1], "sigma3": sigmas[2]}
        add(
            "msrcr",
            {**params, "alpha": alpha, "clipLow": low, "clipHigh": high},
            msrcr(image, sigmas, alpha, low, high),
            source,
        )
