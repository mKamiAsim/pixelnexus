"""Reference results for the oriented filters of Phase 5c: Gabor and the filters built on it.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Every
kernel is checked against scikit-image before the cases are written.
"""

from __future__ import annotations

import math
from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage
from skimage import filters as skfilters

from fixtures_rank import SCIPY_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]

N_STDS = 3


def _fail(message: str) -> None:
    raise SystemExit(message)


def gabor_kernels(
    wavelength: float, angle: float, sigma: float, aspect: float
) -> tuple[FloatArray, FloatArray]:
    """The real and imaginary kernels. The angle turns counterclockwise with y pointing down."""
    theta = angle * math.pi / 180
    ct, st = math.cos(theta), math.sin(theta)
    sx, sy = sigma, sigma / aspect
    x0 = math.ceil(max(abs(N_STDS * sx * ct), abs(N_STDS * sy * st), 1))
    y0 = math.ceil(max(abs(N_STDS * sy * ct), abs(N_STDS * sx * st), 1))
    y, x = np.mgrid[-y0 : y0 + 1, -x0 : x0 + 1].astype(np.float64)
    xr = x * ct - y * st
    yr = x * st + y * ct
    envelope = np.exp(-0.5 * (xr**2 / sx**2 + yr**2 / sy**2)) / (2 * math.pi * sx * sy)
    phase = 2 * math.pi * xr / wavelength
    return envelope * np.cos(phase), envelope * np.sin(phase)


def gabor(
    plane: FloatArray,
    wavelength: float,
    angle: float,
    sigma: float,
    aspect: float,
    output: str,
    mode: str,
) -> FloatArray:
    re, im = gabor_kernels(wavelength, angle, sigma, aspect)
    a = ndimage.correlate(plane, re, mode=mode)
    b = ndimage.correlate(plane, im, mode=mode)
    values = {"real": a, "imaginary": b, "magnitude": np.hypot(a, b)}[output]
    return np.asarray(values, dtype=np.float64)


def _check_gabor(plane: FloatArray) -> None:
    # scikit-image measures theta with the opposite turn and convolves. Its kernels are the same
    # as ours at -angle, so its real part matches and its imaginary part has the opposite sign.
    for wavelength, angle, sigma, aspect in ((4, 0, 1.5, 1), (3, 45, 1.2, 0.8), (5, 135, 1, 2)):
        re, im = skfilters.gabor(  # type: ignore[no-untyped-call]
            plane,
            1 / wavelength,
            theta=-math.radians(angle),
            sigma_x=sigma,
            sigma_y=sigma / aspect,
            mode="mirror",
        )
        ours = [
            gabor(plane, wavelength, angle, sigma, aspect, part, "mirror")
            for part in ("real", "imaginary")
        ]
        if not (np.allclose(ours[0], re) and np.allclose(ours[1], -im)):
            _fail("Gabor disagrees with skimage.filters.gabor")


def add_oriented_cases(plane: FloatArray, add: Add) -> None:
    _check_gabor(plane)
    for border, mode in SCIPY_MODES.items():
        for wavelength, angle, sigma, aspect in (
            (4, 0, 1.5, 1),
            (3, 45, 1.2, 0.8),
            (5, 135, 1, 2),
            (4, 90, 1.5, 0.75),
        ):
            for output in ("real", "imaginary", "magnitude"):
                add(
                    "gabor",
                    {
                        "wavelength": wavelength,
                        "angle": angle,
                        "sigma": sigma,
                        "aspect": aspect,
                        "output": output,
                        "border": border,
                    },
                    gabor(plane, wavelength, angle, sigma, aspect, output, mode),
                    "scipy.ndimage.correlate, checked with skimage.filters.gabor",
                )
