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
# Below this gradient or Hessian spread, the steerable angle is undefined and set to 0.
FLAT = 1e-6


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


def sigma_per_wavelength(bandwidth: float) -> float:
    p = 2.0**bandwidth
    return float(math.sqrt(math.log(2) / 2) * (p + 1) / (math.pi * (p - 1)))


def gabor_bank(
    plane: FloatArray,
    wavelength: float,
    scales: int,
    factor: float,
    orientations: int,
    bandwidth: float,
    aspect: float,
    output: str,
    mode: str,
) -> FloatArray:
    responses = []
    angles = []
    for s in range(scales):
        lam = wavelength * factor**s
        for k in range(orientations):
            angle = k * 180 / orientations
            sigma = lam * sigma_per_wavelength(bandwidth)
            responses.append(gabor(plane, lam, angle, sigma, aspect, "magnitude", mode))
            angles.append(angle)
    stack = np.stack(responses)
    if output == "mean":
        return np.asarray(stack.mean(axis=0), dtype=np.float64)
    if output == "max":
        return np.asarray(stack.max(axis=0), dtype=np.float64)
    # The first filter within a relative 1e-9 of the largest magnitude, as the filter does.
    first = (stack >= stack.max(axis=0) * (1 - 1e-9)).argmax(axis=0)
    return np.asarray(np.array(angles)[first], dtype=np.float64)


def _check_bank(plane: FloatArray) -> None:
    # With aspect ratio 1, each filter of the bank is skimage.filters.gabor with the bandwidth.
    for lam, angle, bandwidth in ((3.0, 60.0, 1.0), (4.5, 0.0, 1.5)):
        re, im = skfilters.gabor(  # type: ignore[no-untyped-call]
            plane, 1 / lam, theta=-math.radians(angle), bandwidth=bandwidth, mode="mirror"
        )
        sigma = lam * sigma_per_wavelength(bandwidth)
        if not np.allclose(
            gabor(plane, lam, angle, sigma, 1, "magnitude", "mirror"), np.hypot(re, im)
        ):
            _fail("The Gabor bank sigma disagrees with skimage.filters.gabor and its bandwidth")


def steerable(
    plane: FloatArray, sigma: float, order: int, angle: float, output: str, mode: str
) -> FloatArray:
    """Gaussian derivatives steered to an angle that turns counterclockwise, y pointing down."""

    def d(oy: int, ox: int) -> FloatArray:
        return np.asarray(
            ndimage.gaussian_filter(plane, sigma, order=(oy, ox), mode=mode, truncate=4.0),
            dtype=np.float64,
        )

    t = math.radians(angle)
    c, s = math.cos(t), math.sin(t)
    if order == 1:
        gx, gy = d(0, 1), d(1, 0)
        if output == "steered":
            return c * gx - s * gy
        if output == "strongest":
            return np.asarray(np.hypot(gx, gy), dtype=np.float64)
        a1 = np.degrees(np.arctan2(-gy, gx))
        a1 = np.where(a1 <= -180 + 1e-9, 180.0, a1)
        angle_1 = np.where(np.hypot(gx, gy) < FLAT, 0.0, a1)
        return np.asarray(angle_1, dtype=np.float64)
    xx, xy, yy = d(0, 2), d(1, 1), d(2, 0)
    if output == "steered":
        return c * c * xx - 2 * c * s * xy + s * s * yy
    mean = (xx + yy) / 2
    spread = np.hypot((xx - yy) / 2, xy)
    if output == "strongest":
        return np.asarray(np.abs(mean) + spread, dtype=np.float64)
    phi = 0.5 * np.degrees(np.arctan2(2 * xy, xx - yy)) + np.where(mean >= 0, 0.0, 90.0)
    a2 = np.mod(-phi, 180.0)
    a2 = np.where(a2 >= 180 - 1e-9, 0.0, a2)
    return np.asarray(np.where(spread < FLAT, 0.0, a2), dtype=np.float64)


def _check_steerable() -> None:
    # A ramp that rises along the angle 30 degrees, counterclockwise with y pointing down.
    t = math.radians(30)
    y, x = np.mgrid[0:24, 0:24].astype(np.float64)
    ramp = 3 * (x * math.cos(t) - y * math.sin(t))
    inner = np.s_[9:-9, 9:-9]
    along = steerable(ramp, 1.5, 1, 30, "steered", "nearest")[inner]
    across = steerable(ramp, 1.5, 1, 120, "steered", "nearest")[inner]
    # Cutting the Gaussian at 4 sigma drops a little of its tails, so the slope comes out about
    # 0.02 percent low.
    if not (np.allclose(along, 3, rtol=1e-3) and np.allclose(across, 0, atol=1e-9)):
        _fail("The steered first derivative of a ramp is not its slope along and 0 across")
    if not np.allclose(steerable(ramp, 1.5, 1, 0, "angle", "nearest")[inner], 30):
        _fail("The angle output of a ramp is not its direction")


def add_oriented_cases(plane: FloatArray, add: Add) -> None:
    _check_gabor(plane)
    _check_bank(plane)
    _check_steerable()
    for border, mode in SCIPY_MODES.items():
        for sigma, order, angle in ((1.0, 1, 30.0), (1.5, 2, 120.0), (2.0, 1, 135.0)):
            for output in ("steered", "strongest", "angle"):
                add(
                    "steerable",
                    {
                        "sigma": sigma,
                        "order": str(order),
                        "angle": angle,
                        "output": output,
                        "border": border,
                    },
                    steerable(plane, sigma, order, angle, output, mode),
                    "scipy.ndimage.gaussian_filter with derivative orders, steered with NumPy",
                )
    for border, mode in SCIPY_MODES.items():
        for wavelength, scales, factor, orientations, bandwidth, aspect in (
            (2.5, 2, 1.5, 4, 1.0, 1.0),
            (3.0, 1, 2.0, 6, 1.5, 0.8),
        ):
            for output in ("max", "mean", "orientation"):
                add(
                    "gabor-bank",
                    {
                        "wavelength": wavelength,
                        "scales": scales,
                        "factor": factor,
                        "orientations": orientations,
                        "bandwidth": bandwidth,
                        "aspect": aspect,
                        "output": output,
                        "border": border,
                    },
                    gabor_bank(
                        plane,
                        wavelength,
                        scales,
                        factor,
                        orientations,
                        bandwidth,
                        aspect,
                        output,
                        mode,
                    ),
                    "scipy.ndimage.correlate per filter, checked with skimage.filters.gabor",
                )
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
