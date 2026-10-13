"""Reference results for the browser filters, made with SciPy, NumPy and scikit-image.

tools/make_fixtures.py writes them to web/tests/fixtures/filters.json. The TypeScript tests
compare the browser filters with these values within the stated tolerance.

Where a second library offers the same operation, this module checks that both libraries agree
before it writes anything. A disagreement stops the script, so a wrong reference never lands.
"""

from __future__ import annotations

import math
from typing import Any, cast

import cv2
import numpy as np
from numpy.typing import NDArray
from scipy import integrate, ndimage, signal, special
from skimage import exposure, filters

from fixtures_impulse import add_impulse_cases, color_cases
from fixtures_rank import add_rank_cases

FloatArray = NDArray[np.float64]

# PixelNexus border mode -> SciPy ndimage mode. "grid-wrap" is SciPy's exact periodic extension.
SCIPY_MODES = {
    "reflect101": "mirror",
    "reflect": "reflect",
    "replicate": "nearest",
    "constant": "constant",
    "wrap": "grid-wrap",
}

# PixelNexus border mode -> numpy.pad mode, used to check the border index rule itself.
NUMPY_PAD_MODES = {
    "reflect101": "reflect",
    "reflect": "symmetric",
    "replicate": "edge",
    "constant": "constant",
    "wrap": "wrap",
}

BORDERS = list(SCIPY_MODES)
WIDTH = 13
HEIGHT = 10


def input_plane(seed: int) -> FloatArray:
    """A random 8-bit plane with an odd, non-square size."""
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, size=(HEIGHT, WIDTH)).astype(np.float64)


def _values(array: FloatArray) -> list[float]:
    return [round(float(v), 6) for v in array.reshape(-1)]


# Motion blur kernel. The same definition as web/src/core/filters/linear/motion-blur.ts,
# written again here so that an indexing or orientation mistake in either one shows up.


def _direction(angle_deg: float) -> tuple[float, float]:
    theta = math.radians(angle_deg)
    dx, dy = math.cos(theta), -math.sin(theta)
    return (0.0 if abs(dx) < 1e-12 else dx, 0.0 if abs(dy) < 1e-12 else dy)


def motion_kernel(length: float, angle_deg: float) -> FloatArray:
    dx, dy = _direction(angle_deg)
    reach = length / 2 * max(abs(dx), abs(dy))
    radius = max(0, math.ceil(reach - 0.5))
    size = 2 * radius + 1
    kernel = np.zeros((size, size))
    for j in range(size):
        for i in range(size):
            x, y = i - radius, j - radius
            lo, hi = -length / 2, length / 2
            inside = True
            for d, a, b in ((dx, x - 0.5, x + 0.5), (dy, y - 0.5, y + 0.5)):
                if d == 0:
                    if not a <= 0 <= b:
                        inside = False
                    continue
                ta, tb = a / d, b / d
                lo, hi = max(lo, min(ta, tb)), min(hi, max(ta, tb))
            in_cell = max(0.0, hi - lo) if inside else 0.0
            kernel[j, i] = 0.0 if in_cell < 1e-12 else in_cell
    return np.asarray(kernel / kernel.sum(), dtype=np.float64)


def _unsharp(
    plane: FloatArray,
    sigma: float,
    amount: float,
    threshold: float,
    mode: str,
    truncate: float = 3.0,
) -> Any:
    blurred = ndimage.gaussian_filter(plane, sigma, truncate=truncate, mode=mode)
    detail = plane - blurred
    return np.where(np.abs(detail) < threshold, plane, plane + amount * detail)


def _check_unsharp_against_skimage(plane: FloatArray) -> None:
    """skimage blurs with mode "reflect" and truncate 4, and clips. Compare on that setup."""
    ours = np.clip(_unsharp(plane, 1.5, 1.0, 0.0, "reflect", truncate=4.0), 0, 255)
    theirs = filters.unsharp_mask(plane / 255, radius=1.5, amount=1.0) * 255  # type: ignore[no-untyped-call]
    if not np.allclose(ours, theirs, atol=1e-6):
        raise SystemExit("unsharp mask reference disagrees with skimage.filters.unsharp_mask")


def _check_luma601_against_opencv() -> None:
    rng = np.random.default_rng(7)
    rgb = rng.integers(0, 256, size=(4, 8, 3)).astype(np.uint8)
    ours = rgb.astype(np.float64) @ np.array([0.299, 0.587, 0.114])
    theirs = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float64)
    # OpenCV rounds with fixed-point arithmetic, so allow one level.
    if np.max(np.abs(np.round(ours) - theirs)) > 1:
        raise SystemExit("BT.601 luma reference disagrees with OpenCV")


def _check_laplace_against_scipy(plane: FloatArray) -> None:
    four = ndimage.correlate(plane, np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]]), mode="mirror")
    if not np.allclose(four, ndimage.laplace(plane, mode="mirror")):
        raise SystemExit("4-neighbor Laplacian kernel disagrees with scipy.ndimage.laplace")


def _check_sobel_against_opencv(plane: FloatArray) -> None:
    ours = ndimage.sobel(plane, axis=1, mode="mirror")
    theirs = cv2.Sobel(plane, cv2.CV_64F, 1, 0, ksize=3, borderType=cv2.BORDER_REFLECT_101)
    if not np.allclose(ours, theirs):
        raise SystemExit("SciPy Sobel disagrees with OpenCV Sobel")


def binomial_weights(size: int) -> FloatArray:
    row = special.comb(size - 1, np.arange(size))
    return np.asarray(row / row.sum(), dtype=np.float64)


def tent_weights(size: int) -> FloatArray:
    r = (size - 1) // 2
    w = r + 1 - np.abs(np.arange(-r, r + 1))
    return np.asarray(w / w.sum(), dtype=np.float64)


def disk_kernel(radius: float) -> FloatArray:
    """The area of the disk inside each cell, by numerical integration, then normalized."""
    r = max(0, math.ceil(radius - 0.5))
    size = 2 * r + 1
    kernel = np.zeros((size, size))

    def height(x: float) -> float:
        return math.sqrt(max(0.0, radius * radius - x * x))

    for j in range(size):
        for i in range(size):
            x0, x1 = max(i - r - 0.5, -radius), min(i - r + 0.5, radius)
            y0, y1 = j - r - 0.5, j - r + 0.5
            if x1 <= x0:
                continue
            cuts = [
                c
                for y in (y0, y1)
                if abs(y) < radius
                for c in (-math.sqrt(radius * radius - y * y), math.sqrt(radius * radius - y * y))
                if x0 < c < x1
            ]
            area, _ = integrate.quad(
                lambda x, y0=y0, y1=y1: max(0.0, min(y1, height(x)) - max(y0, -height(x))),
                x0,
                x1,
                points=cuts or None,
                epsabs=1e-13,
                epsrel=1e-12,
            )
            kernel[j, i] = area
    if abs(kernel.sum() - math.pi * radius * radius) > 1e-8:
        raise SystemExit("disk kernel areas do not add up to pi R^2")
    return np.asarray(kernel / kernel.sum(), dtype=np.float64)


def _check_disk_against_sampling(radius: float) -> None:
    """Count fine sample points inside the disk, as a second way to get each cell's area."""
    r = max(0, math.ceil(radius - 0.5))
    n = 400
    offsets = (np.arange(n) + 0.5) / n - 0.5
    kernel = np.zeros((2 * r + 1, 2 * r + 1))
    for j in range(2 * r + 1):
        for i in range(2 * r + 1):
            xs = (i - r) + offsets
            ys = (j - r) + offsets
            inside = (xs[None, :] ** 2 + ys[:, None] ** 2) <= radius * radius
            kernel[j, i] = inside.mean()
    if not np.allclose(kernel / kernel.sum(), disk_kernel(radius), atol=2e-4):
        raise SystemExit("disk kernel disagrees with point sampling")


def _check_tent_and_binomial() -> None:
    for size in (3, 5, 9):
        r = (size - 1) // 2
        box = np.ones(r + 1)
        if not np.allclose(np.convolve(box, box) / (r + 1) ** 2, tent_weights(size)):
            raise SystemExit("tent weights disagree with two boxes")
        row = np.array([1.0])
        for _ in range(size - 1):
            row = np.convolve(row, [0.5, 0.5])
        if not np.allclose(row, binomial_weights(size)):
            raise SystemExit("binomial weights disagree with repeated averaging")


def _separable(plane: FloatArray, weights: FloatArray, mode: str) -> Any:
    rows = ndimage.correlate1d(plane, weights, axis=1, mode=mode)
    return ndimage.correlate1d(rows, weights, axis=0, mode=mode)


LAPLACE_4 = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
LAPLACE_8 = np.array([[1, 1, 1], [1, -8, 1], [1, 1, 1]], dtype=np.float64)
DELTA_3 = np.array([[0, 0, 0], [0, 1, 0], [0, 0, 0]], dtype=np.float64)


def _check_sharpen_against_laplace(plane: FloatArray) -> None:
    ours = ndimage.correlate(plane, DELTA_3 - 0.7 * LAPLACE_4, mode="mirror")
    theirs = plane - 0.7 * ndimage.laplace(plane, mode="mirror")
    if not np.allclose(ours, theirs):
        raise SystemExit("Laplacian sharpening kernel disagrees with scipy.ndimage.laplace")


def _check_kernel_text_against_sobel(plane: FloatArray) -> None:
    kernel = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float64)
    ours = ndimage.correlate(plane, kernel, mode="mirror")
    if not np.allclose(ours, ndimage.sobel(plane, axis=1, mode="mirror")):
        raise SystemExit("weighted average with a Sobel kernel disagrees with scipy.ndimage.sobel")


def parse_kernel(text: str) -> FloatArray:
    rows = [line.replace(",", " ").split() for line in text.replace("\n", ";").split(";")]
    return np.array([[float(v) for v in row] for row in rows if row], dtype=np.float64)


def _srgb_to_linear(v: FloatArray) -> FloatArray:
    c = v / 255
    return np.asarray(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4))


def _linear_to_srgb(v: FloatArray) -> FloatArray:
    c = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    return np.asarray(c * 255)


def filter_cases() -> dict[str, Any]:
    plane = input_plane(20261012)
    _check_unsharp_against_skimage(plane)
    _check_luma601_against_opencv()
    _check_laplace_against_scipy(plane)
    _check_sobel_against_opencv(plane)
    _check_tent_and_binomial()
    for radius in (1.5, 2.3):
        _check_disk_against_sampling(radius)
    _check_sharpen_against_laplace(plane)
    _check_kernel_text_against_sobel(plane)

    cases: list[dict[str, Any]] = []

    def add(
        filter_id: str,
        params: dict[str, Any],
        output: FloatArray,
        source: str,
        input_name: str | None = None,
    ) -> None:
        case = {"filter": filter_id, "params": params, "source": source, "output": _values(output)}
        if input_name:
            case["input"] = input_name
        cases.append(case)

    for border in BORDERS:
        mode = SCIPY_MODES[border]
        for size in (3, 5):
            add(
                "box",
                {"size": size, "border": border},
                ndimage.uniform_filter(plane, size, mode=mode),
                "scipy.ndimage.uniform_filter",
            )
        for sigma, truncate in ((1.0, 3.0), (2.2, 3.0), (0.7, 4.0)):
            add(
                "gaussian",
                {"sigma": sigma, "truncate": truncate, "border": border},
                ndimage.gaussian_filter(plane, sigma, truncate=truncate, mode=mode),
                "scipy.ndimage.gaussian_filter",
            )
        for size in (3, 5, 7):
            add(
                "median",
                {"size": size, "border": border},
                ndimage.median_filter(plane, size=size, mode=mode),
                "scipy.ndimage.median_filter",
            )
        gx = ndimage.sobel(plane, axis=1, mode=mode)
        gy = ndimage.sobel(plane, axis=0, mode=mode)
        sobel_outputs = {
            ("gx", "l2"): gx,
            ("gy", "l2"): gy,
            ("magnitude", "l2"): np.hypot(gx, gy),
            ("magnitude", "l1"): np.abs(gx) + np.abs(gy),
            ("direction", "l2"): np.degrees(np.arctan2(gy, gx)),
        }
        for (output, norm), values in sobel_outputs.items():
            add(
                "sobel",
                {"output": output, "norm": norm, "border": border},
                values,
                "scipy.ndimage.sobel",
            )

    for border in ("reflect101", "constant", "wrap"):
        mode = SCIPY_MODES[border]
        for neighbors, kernel in (
            ("4", np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)),
            ("8", np.array([[1, 1, 1], [1, -8, 1], [1, 1, 1]], dtype=np.float64)),
        ):
            for sign, factor in (("negative-center", 1.0), ("positive-center", -1.0)):
                add(
                    "laplacian",
                    {"neighbors": neighbors, "sign": sign, "border": border},
                    ndimage.correlate(plane, factor * kernel, mode=mode),
                    "scipy.ndimage.correlate",
                )
        for length, angle in ((9, 0), (5, 90), (7, 30), (10.5, 135), (4, 0)):
            add(
                "motion-blur",
                {"length": length, "angle": angle, "border": border},
                ndimage.correlate(plane, motion_kernel(length, angle), mode=mode),
                "scipy.ndimage.correlate with the motion kernel",
            )
        for sigma, amount, threshold in ((1.5, 1.0, 0.0), (2.0, 0.6, 10.0)):
            add(
                "unsharp-mask",
                {"sigma": sigma, "amount": amount, "threshold": threshold, "border": border},
                _unsharp(plane, sigma, amount, threshold, mode),
                "scipy.ndimage.gaussian_filter",
            )

    for border in BORDERS:
        mode = SCIPY_MODES[border]
        for size in (3, 5, 7):
            add(
                "binomial",
                {"size": size, "border": border},
                _separable(plane, binomial_weights(size), mode),
                "scipy.ndimage.correlate1d with binomial weights from scipy.special.comb",
            )
            add(
                "triangular",
                {"size": size, "border": border},
                _separable(plane, tent_weights(size), mode),
                "scipy.ndimage.correlate1d with tent weights",
            )
        for radius in (1.5, 2.3, 3.0):
            add(
                "disk-average",
                {"radius": radius, "border": border},
                ndimage.correlate(plane, disk_kernel(radius), mode=mode),
                "scipy.ndimage.correlate with the disk kernel from scipy.integrate.quad",
            )
        for taps, cutoff, window in ((7, 0.2, "hamming"), (9, 0.1, "blackman"), (5, 0.3, "hann")):
            add(
                "fir-lowpass",
                {"taps": taps, "cutoff": cutoff, "window": window, "border": border},
                _separable(plane, signal.firwin(taps, 2 * cutoff, window=window), mode),
                "scipy.ndimage.correlate1d with scipy.signal.firwin taps",
            )
        add(
            "fir-lowpass",
            {"taps": 11, "cutoff": 0.15, "window": "kaiser", "beta": 6.0, "border": border},
            _separable(plane, signal.firwin(11, 0.3, window=("kaiser", 6.0)), mode),
            "scipy.ndimage.correlate1d with scipy.signal.firwin taps",
        )

    for border in ("reflect101", "replicate", "wrap"):
        mode = SCIPY_MODES[border]
        for neighbors, kernel in (("4", LAPLACE_4), ("8", LAPLACE_8)):
            for amount in (0.5, 1.0):
                add(
                    "laplacian-sharpen",
                    {"neighbors": neighbors, "amount": amount, "border": border},
                    ndimage.correlate(plane, DELTA_3 - amount * kernel, mode=mode),
                    "scipy.ndimage.correlate",
                )
        for sigma in (1.0, 2.5):
            blurred = ndimage.gaussian_filter(plane, sigma, truncate=3.0, mode=mode)
            add(
                "high-pass",
                {"sigma": sigma, "border": border},
                plane - blurred,
                "scipy.ndimage.gaussian_filter",
            )
            for boost in (1.0, 1.7, 2.0):
                add(
                    "high-boost",
                    {"sigma": sigma, "boost": boost, "border": border},
                    boost * plane - blurred,
                    "scipy.ndimage.gaussian_filter",
                )
        for text, normalize in (
            ("1 2 1; 2 4 2; 1 2 1", True),
            ("0 1 2 1 0; 1 2 4 2 1; 0 1 2 1 0", True),
            ("-1 0 1; -2 0 2; -1 0 1", False),
            ("1, 1, 1\n1, 1, 1\n1, 1, 1", False),
        ):
            kernel = parse_kernel(text)
            if normalize and kernel.sum() != 0:
                kernel = kernel / kernel.sum()
            add(
                "weighted-average",
                {"kernel": text, "normalize": normalize, "border": border},
                ndimage.correlate(plane, kernel, mode=mode),
                "scipy.ndimage.correlate",
            )

    extra_inputs = add_rank_cases(plane, add) | add_impulse_cases(plane, add)

    fir_taps = [
        {
            "taps": taps,
            "cutoff": cutoff,
            "window": window,
            "beta": beta,
            "output": _values(
                signal.firwin(
                    taps, 2 * cutoff, window=(window, beta) if window == "kaiser" else window
                )
            ),
        }
        for taps, cutoff, window, beta in (
            (7, 0.2, "hamming", 0.0),
            (15, 0.15, "hann", 0.0),
            (21, 0.05, "blackman", 0.0),
            (11, 0.15, "kaiser", 6.0),
            (31, 0.45, "kaiser", 2.0),
        )
    ]
    disk_kernels = [
        {"radius": radius, "rows": disk_kernel(radius).round(12).tolist()}
        for radius in (0.5, 1.0, 1.5, 2.3, 3.0, 4.7)
    ]

    levels = np.arange(256, dtype=np.float64)
    gamma_cases = [
        {"gamma": g, "output": _values(exposure.adjust_gamma(levels / 255, g) * 255)}  # type: ignore[no-untyped-call]
        for g in (0.45, 1.0, 2.2)
    ]

    rng = np.random.default_rng(11)
    rgb = rng.integers(0, 256, size=(24, 3)).astype(np.float64)
    linear = _srgb_to_linear(rgb) @ np.array([0.2126, 0.7152, 0.0722])
    grayscale = {
        "rgb": rgb.astype(int).reshape(-1).tolist(),
        "luma709": _values(rgb @ np.array([0.2126, 0.7152, 0.0722])),
        "luma601": _values(rgb @ np.array([0.299, 0.587, 0.114])),
        "luminance": _values(_linear_to_srgb(linear)),
    }

    borders = {}
    for border, pad_mode in NUMPY_PAD_MODES.items():
        for n in (1, 2, 5):
            if pad_mode == "constant":
                padded = np.pad(np.arange(n), 7, mode="constant", constant_values=-1)
            else:
                padded = np.pad(np.arange(n), 7, mode=cast(Any, pad_mode))
            borders[f"{border}-{n}"] = padded.tolist()

    motion_kernels = [
        {"length": length, "angle": angle, "rows": motion_kernel(length, angle).round(12).tolist()}
        for length, angle in ((9, 0), (4, 0), (5, 90), (7, 30), (10.5, 135), (3, 45))
    ]

    return {
        "generator": "tools/make_fixtures.py",
        "description": "Reference outputs for the browser filters on one random 8-bit plane.",
        "tolerance": 1e-4,
        "width": WIDTH,
        "height": HEIGHT,
        "input": plane.astype(int).reshape(-1).tolist(),
        "inputs": {name: p.astype(int).reshape(-1).tolist() for name, p in extra_inputs.items()},
        "cases": cases,
        "color": color_cases(),
        "gamma": gamma_cases,
        "grayscale": grayscale,
        "borders": {"pad": 7, "constant": -1, "tables": borders},
        "motionKernels": motion_kernels,
        "firTaps": fir_taps,
        "diskKernels": disk_kernels,
    }
