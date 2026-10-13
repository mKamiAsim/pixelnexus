"""Reference results for the frequency-domain filters of Phase 5e.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Each
reference extends the plane with numpy.pad as web/src/core/filters/frequency/spectral.ts does,
filters it with numpy.fft and crops it. Before the cases are written, the script checks the
Gaussian low-pass filter against scipy.ndimage.gaussian_filter and the complement rules.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

FloatArray = NDArray[np.float64]
Add = Callable[..., None]
Response = Callable[[FloatArray, FloatArray], FloatArray]

MAX_MARGIN = 256

# PixelNexus border mode -> numpy.pad mode.
PAD_MODES = {
    "reflect101": "reflect",
    "reflect": "symmetric",
    "replicate": "edge",
    "constant": "constant",
    "wrap": "wrap",
}


def _fail(message: str) -> None:
    raise SystemExit(message)


def next_fast(n: int) -> int:
    """The smallest length of at least n with no prime factor other than 2, 3 and 5."""
    m = max(1, n)
    while True:
        k = m
        for p in (2, 3, 5):
            while k % p == 0:
                k //= p
        if k == 1:
            return m
        m += 1


def margin(n: int) -> int:
    return min(math.ceil(n / 2), MAX_MARGIN)


def frequency_filter(plane: FloatArray, border: str, response: Response) -> FloatArray:
    """Extend, transform, multiply by H(fx, fy), transform back and crop. Returns the real part."""
    h, w = plane.shape
    mx, my = margin(w), margin(h)
    width, height = next_fast(w + 2 * mx), next_fast(h + 2 * my)
    pad = ((my, height - h - my), (mx, width - w - mx))
    extended = np.pad(plane, pad, mode=cast(Any, PAD_MODES[border]))
    fx = np.fft.fftfreq(width)[None, :]
    fy = np.fft.fftfreq(height)[:, None]
    result = np.fft.ifft2(np.fft.fft2(extended) * response(fx, fy))
    return np.asarray(result.real[my : my + h, mx : mx + w], dtype=np.float64)


def pass_response(shape: str, band: str, d0: float, width: float, order: float) -> Response:
    """Gonzalez and Woods, chapter 4, with D in cycles per pixel."""

    def lowpass(d: FloatArray) -> FloatArray:
        if shape == "ideal":
            return np.where(d <= d0, 1.0, 0.0)
        if shape == "butterworth":
            return 1 / (1 + (d / d0) ** (2 * order))
        return np.exp(-(d * d) / (2 * d0 * d0))

    def bandreject(d: FloatArray) -> FloatArray:
        if shape == "ideal":
            return np.where((d >= d0 - width / 2) & (d <= d0 + width / 2), 0.0, 1.0)
        q = d * d - d0 * d0
        with np.errstate(divide="ignore"):
            if shape == "butterworth":
                safe = np.where(q == 0, 1.0, q)
                return np.where(q == 0, 0.0, 1 / (1 + (d * width / safe) ** (2 * order)))
            safe = np.where(d == 0, 1.0, d)
            return np.where(d == 0, 1.0, 1 - np.exp(-((q / (safe * width)) ** 2)))

    def response(fx: FloatArray, fy: FloatArray) -> FloatArray:
        d = np.sqrt(fx * fx + fy * fy)
        if band == "lowpass":
            return lowpass(d)
        if band == "highpass":
            return 1 - lowpass(d)
        if band == "bandreject":
            return bandreject(d)
        return 1 - bandreject(d)

    return response


def _checks() -> None:
    rng = np.random.default_rng(5)
    big = rng.integers(0, 256, size=(64, 48)).astype(np.float64)
    # The Gaussian response exp(-D^2 / 2 D0^2) is the transform of a Gaussian with
    # sigma = 1 / (2 pi D0). Extended with the reflect mode by half its size, the 64 x 48 plane
    # repeats as an exact mirror, so the result equals the spatial filter with the same border.
    # Sigma is at least 2.5, so the sampled Gaussian has no aliasing worth counting.
    for sigma in (2.5, 3.2):
        d0 = 1 / (2 * math.pi * sigma)
        ours = frequency_filter(big, "reflect", pass_response("gaussian", "lowpass", d0, 0, 0))
        theirs = ndimage.gaussian_filter(big, sigma, mode="reflect", truncate=8.0)
        if not np.allclose(ours, theirs, atol=1e-6):
            _fail("the Gaussian low-pass filter disagrees with scipy.ndimage.gaussian_filter")
    for shape in ("ideal", "butterworth", "gaussian"):
        for low, high in (("lowpass", "highpass"), ("bandreject", "bandpass")):
            a = frequency_filter(big, "reflect101", pass_response(shape, low, 0.15, 0.1, 2))
            b = frequency_filter(big, "reflect101", pass_response(shape, high, 0.15, 0.1, 2))
            if not np.allclose(a + b, big, atol=1e-6):
                _fail(f"the {shape} {low} and {high} filters do not add up to the image")


def add_frequency_cases(plane: FloatArray, add: Add) -> None:
    _checks()
    source = "numpy.fft on the plane extended with numpy.pad"
    for shape in ("ideal", "butterworth", "gaussian"):
        orders = (2,) if shape == "butterworth" else (None,)
        for band in ("lowpass", "highpass"):
            for cutoff, border in ((0.1, "reflect"), (0.23, "reflect101"), (0.07, "constant")):
                for order in orders:
                    params: dict[str, Any] = {"cutoff": cutoff, "border": border}
                    if order is not None:
                        params["order"] = order
                    response = pass_response(shape, band, cutoff, 0, order or 0)
                    add(
                        f"{shape}-{band}", params, frequency_filter(plane, border, response), source
                    )
        for band in ("bandpass", "bandreject"):
            for center, width, border in ((0.2, 0.1, "reflect"), (0.3, 0.06, "wrap")):
                for order in orders:
                    params = {"center": center, "width": width, "border": border}
                    if order is not None:
                        params["order"] = order
                    response = pass_response(shape, band, center, width, order or 0)
                    add(
                        f"{shape}-{band}", params, frequency_filter(plane, border, response), source
                    )
    for border in ("replicate", "wrap"):
        params = {"cutoff": 0.12, "order": 4, "border": border}
        response = pass_response("butterworth", "lowpass", 0.12, 0, 4)
        add("butterworth-lowpass", params, frequency_filter(plane, border, response), source)
