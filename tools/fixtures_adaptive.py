"""Reference results for the adaptive filters and local statistics of Phase 5b.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Each
reference follows its definition with NumPy and SciPy, and is checked against a library or a
limiting case before it is used.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage, signal
from skimage.filters import rank

from fixtures_rank import PAD_MODES, SCIPY_MODES, flat_windows

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def _fail(message: str) -> None:
    raise SystemExit(message)


def local_moments(plane: FloatArray, size: int, border: str) -> tuple[FloatArray, FloatArray]:
    w = flat_windows(plane, size, border)
    return w.mean(axis=-1), w.var(axis=-1)


def local_entropy(plane: FloatArray, size: int, border: str) -> FloatArray:
    w = flat_windows(np.round(plane), size, border).astype(np.int64)
    out = np.zeros(w.shape[:2])
    n = w.shape[-1]
    for y in range(w.shape[0]):
        for x in range(w.shape[1]):
            p = np.bincount(w[y, x], minlength=256) / n
            p = p[p > 0]
            out[y, x] = -(p * np.log2(p)).sum()
    return out


def savgol(plane: FloatArray, size: int, order: int, border: str) -> FloatArray:
    c = signal.savgol_coeffs(size, order)
    mode = SCIPY_MODES[border]
    rows = ndimage.correlate1d(plane, c, axis=1, mode=mode)
    return np.asarray(ndimage.correlate1d(rows, c, axis=0, mode=mode), dtype=np.float64)


def local_noise(plane: FloatArray, size: int, noise_var: float, border: str) -> FloatArray:
    m, v = local_moments(plane, size, border)
    denominator = np.maximum(v, noise_var)
    gain = np.where(
        denominator > 0, np.maximum(0, v - noise_var) / np.where(denominator > 0, denominator, 1), 0
    )
    return np.asarray(m + gain * (plane - m), dtype=np.float64)


def sigma_filter(
    plane: FloatArray, size: int, sigma: float, k: float, min_count: int, border: str
) -> FloatArray:
    w = flat_windows(plane, size, border)
    c = (size * size - 1) // 2
    out = np.zeros_like(plane)
    r = size // 2
    ring = [(r + dy) * size + r + dx for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]
    for y in range(plane.shape[0]):
        for x in range(plane.shape[1]):
            values = w[y, x]
            inside = np.abs(values - values[c]) <= k * sigma
            out[y, x] = values[inside].mean() if inside.sum() >= min_count else values[ring].mean()
    return out


def adaptive_smoothing(plane: FloatArray, steps: int, k: float, border: str) -> FloatArray:
    pad = 2 * steps
    cur = np.pad(plane, pad, mode=PAD_MODES[border])  # type: ignore[call-overload]
    for _ in range(steps):
        e = np.pad(cur, 1, mode="edge")
        gx = (e[1:-1, 2:] - e[1:-1, :-2]) / 2
        gy = (e[2:, 1:-1] - e[:-2, 1:-1]) / 2
        w = np.exp(-(gx**2 + gy**2) / (2 * k * k))
        num = ndimage.correlate(cur * w, np.ones((3, 3)), mode="nearest")
        den = ndimage.correlate(w, np.ones((3, 3)), mode="nearest")
        cur = num / den
    return np.asarray(cur[pad:-pad, pad:-pad], dtype=np.float64)


def _cross_checks(plane: FloatArray) -> None:
    for border, mode in SCIPY_MODES.items():
        _m, v = local_moments(plane, 5, border)
        if not np.allclose(v, ndimage.generic_filter(plane, np.var, size=5, mode=mode)):
            _fail("local variance disagrees with scipy.ndimage.generic_filter(np.var)")
        if not np.allclose(
            local_noise(plane, 3, 1e9, border), ndimage.uniform_filter(plane, 3, mode=mode)
        ):
            _fail("local noise filter with a huge noise level is not the box mean")
        if not np.allclose(
            sigma_filter(plane, 5, 1000, 2, 1, border), ndimage.uniform_filter(plane, 5, mode=mode)
        ):
            _fail("sigma filter with a huge range is not the box mean")
    # SciPy's Wiener filter pads with zeros, our constant mode.
    for size, noise in ((3, 100.0), (5, 400.0)):
        theirs = signal.wiener(plane, size, noise)
        if not np.allclose(local_noise(plane, size, noise, "constant"), theirs):
            _fail("adaptive Wiener disagrees with scipy.signal.wiener")
    theirs = signal.savgol_filter(
        signal.savgol_filter(plane, 7, 2, axis=1, mode="mirror"), 7, 2, axis=0, mode="mirror"
    )
    if not np.allclose(savgol(plane, 7, 2, "reflect101"), theirs):
        _fail("Savitzky-Golay disagrees with scipy.signal.savgol_filter")
    for size in (3, 5):
        r = size // 2
        theirs = rank.entropy(plane.astype(np.uint8), np.ones((size, size), dtype=np.uint8))  # type: ignore[no-untyped-call]
        ours = local_entropy(plane, size, "reflect101")
        if not np.allclose(ours[r:-r, r:-r], theirs[r:-r, r:-r]):
            _fail("local entropy disagrees with skimage.filters.rank.entropy")
    # With a huge k every weight is 1, so each step is a 3x3 box mean.
    box = np.pad(plane, 6, mode="reflect")
    for _ in range(3):
        box = ndimage.uniform_filter(box, 3, mode="nearest")
    if not np.allclose(adaptive_smoothing(plane, 3, 1e9, "reflect101"), box[6:-6, 6:-6]):
        _fail("adaptive smoothing with a huge k is not a repeated box mean")


def add_adaptive_cases(plane: FloatArray, add: Add) -> None:
    _cross_checks(plane)
    for border, mode in SCIPY_MODES.items():
        for size in (3, 5):
            params = {"size": size, "border": border}
            _m, v = local_moments(plane, size, border)
            add(
                "local-variance",
                params,
                v,
                "NumPy windows, checked with scipy.ndimage.generic_filter",
            )
            add(
                "local-std",
                params,
                np.sqrt(v),
                "NumPy windows, checked with scipy.ndimage.generic_filter",
            )
            add(
                "local-range",
                params,
                ndimage.maximum_filter(plane, size, mode=mode)
                - ndimage.minimum_filter(plane, size, mode=mode),
                "scipy.ndimage maximum and minimum filters",
            )
            add(
                "local-entropy",
                params,
                local_entropy(plane, size, border),
                "NumPy histograms, checked with skimage.filters.rank.entropy",
            )
        for size, order in ((5, 2), (7, 3), (9, 4), (5, 0)):
            add(
                "savgol",
                {"size": size, "order": order, "border": border},
                savgol(plane, size, order, border),
                "scipy.signal.savgol_coeffs, checked with scipy.signal.savgol_filter",
            )
        for filter_id in ("wiener-adaptive", "adaptive-local-noise"):
            for size, noise in ((3, 10.0), (5, 25.0)):
                add(
                    filter_id,
                    {"size": size, "noise": noise, "border": border},
                    local_noise(plane, size, noise**2, border),
                    "NumPy windows, checked with scipy.signal.wiener",
                )
        for size, sigma, k, min_count in ((5, 20.0, 2.0, 3), (3, 30.0, 1.5, 4), (7, 10.0, 2.0, 2)):
            add(
                "sigma",
                {"size": size, "sigma": sigma, "k": k, "minCount": min_count, "border": border},
                sigma_filter(plane, size, sigma, k, min_count, border),
                "NumPy windows, checked against the box mean",
            )
        for steps, k in ((2, 15.0), (4, 40.0)):
            add(
                "adaptive-smoothing",
                {"iterations": steps, "k": k, "border": border},
                adaptive_smoothing(plane, steps, k, border),
                "NumPy, checked against a repeated box mean",
            )
