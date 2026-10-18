"""Reference results for the speckle filters of Phase 5b.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. The
formulas follow Lopes, Touzi and Nezry (1990), Lopes, Nezry, Touzi and Laur (1990), Frost and
others (1982) and Yu and Acton (2002). No common library implements them, so each reference is
checked against limiting cases and algebraic identities instead.
"""

from __future__ import annotations

import math
from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from fixtures_rank import PAD_MODES, SCIPY_MODES, flat_windows

FloatArray = NDArray[np.float64]
Add = Callable[..., None]
TINY = 1e-12


def _fail(message: str) -> None:
    raise SystemExit(message)


def variation(plane: FloatArray, size: int, border: str) -> tuple[FloatArray, FloatArray]:
    w = flat_windows(plane, size, border)
    m = w.mean(axis=-1)
    v = w.var(axis=-1)
    ci = np.where(m > 0, np.sqrt(v) / np.where(m > 0, m, 1), 0.0)
    return m, ci


def c_max(cu: float) -> float:
    return math.sqrt(1 + 2 * cu * cu)


def lee(plane: FloatArray, size: int, cu: float, border: str) -> FloatArray:
    m, ci = variation(plane, size, border)
    w = np.where(ci > 0, np.clip(1 - cu * cu / np.where(ci > 0, ci, 1) ** 2, 0, 1), 0.0)
    return np.asarray(m + w * (plane - m), dtype=np.float64)


def kuan(plane: FloatArray, size: int, cu: float, border: str) -> FloatArray:
    m, ci = variation(plane, size, border)
    w = np.where(
        ci > 0, np.maximum(0, (1 - cu * cu / np.where(ci > 0, ci, 1) ** 2) / (1 + cu * cu)), 0.0
    )
    return np.asarray(m + w * (plane - m), dtype=np.float64)


def enhanced_lee(plane: FloatArray, size: int, cu: float, k: float, border: str) -> FloatArray:
    m, ci = variation(plane, size, border)
    cm = c_max(cu)
    out = np.empty_like(plane)
    for idx in np.ndindex(plane.shape):
        z, mean, c = plane[idx], m[idx], ci[idx]
        if c <= cu:
            out[idx] = mean
        elif c >= cm:
            out[idx] = z
        else:
            w = math.exp(-k * (c - cu) / (cm - c))
            out[idx] = mean * w + z * (1 - w)
    return out


def gamma_map(plane: FloatArray, size: int, cu: float, border: str) -> FloatArray:
    m, ci = variation(plane, size, border)
    cm = c_max(cu)
    looks = 1 / (cu * cu)
    out = np.empty_like(plane)
    for idx in np.ndindex(plane.shape):
        z, mean, c = plane[idx], m[idx], ci[idx]
        if c <= cu:
            out[idx] = mean
        elif c >= cm:
            out[idx] = z
        else:
            alpha = (1 + cu * cu) / (c * c - cu * cu)
            b = alpha - looks - 1
            out[idx] = (
                b * mean + math.sqrt(mean * mean * b * b + 4 * alpha * looks * z * mean)
            ) / (2 * alpha)
    return out


def frost(plane: FloatArray, size: int, k: float, border: str) -> FloatArray:
    _m, ci = variation(plane, size, border)
    w = flat_windows(plane, size, border)
    r = size // 2
    dy, dx = np.mgrid[-r : r + 1, -r : r + 1]
    d = np.hypot(dx, dy).reshape(-1)
    weights = np.exp(-k * (ci**2)[..., None] * d[None, None, :])
    return np.asarray((weights * w).sum(-1) / weights.sum(-1), dtype=np.float64)


def srad(
    plane: FloatArray, steps: int, dt: float, q0: float, rho: float, border: str
) -> FloatArray:
    cur = np.pad(plane, steps, mode=PAD_MODES[border])  # type: ignore[call-overload]
    for t in range(steps):
        q0s = (q0 * math.exp(-rho * t * dt)) ** 2
        e = np.pad(cur, 1, mode="edge")
        d_n = e[:-2, 1:-1] - cur
        d_s = e[2:, 1:-1] - cur
        d_w = e[1:-1, :-2] - cur
        d_e = e[1:-1, 2:] - cur
        g2 = (d_n**2 + d_s**2 + d_w**2 + d_e**2) / (cur**2 + TINY)
        lap = (d_n + d_s + d_w + d_e) / (cur + TINY)
        q2 = (0.5 * g2 - lap**2 / 16) / ((1 + lap / 4) ** 2 + TINY)
        c = np.clip(1 / (1 + (q2 - q0s) / (q0s * (1 + q0s) + TINY)), 0, 1)
        ce = np.pad(c, 1, mode="edge")
        div = ce[2:, 1:-1] * d_s + c * d_n + ce[1:-1, 2:] * d_e + c * d_w
        cur = cur + dt / 4 * div
    return np.asarray(cur[steps:-steps, steps:-steps], dtype=np.float64)


def _cross_checks(plane: FloatArray) -> None:
    for border, mode in SCIPY_MODES.items():
        if not np.allclose(lee(plane, 5, 0.0, border), plane):
            _fail("Lee filter with no speckle changes the image")
        if not np.allclose(
            frost(plane, 5, 0.0, border), ndimage.uniform_filter(plane, 5, mode=mode)
        ):
            _fail("Frost filter with no damping is not the box mean")
    # The Kuan weight is the Lee weight over 1 + C_u^2 where both are positive.
    m, ci = variation(plane, 5, "reflect101")
    cu = 0.3
    inside = ci > cu
    w_lee = (lee(plane, 5, cu, "reflect101") - m)[inside]
    w_kuan = (kuan(plane, 5, cu, "reflect101") - m)[inside]
    if not np.allclose(w_kuan * (1 + cu * cu), w_lee):
        _fail("Kuan and Lee weights do not differ by 1 + C_u^2")
    # The Gamma-MAP value solves alpha R^2 - (alpha - L - 1) m R - L z m = 0.
    looks = 1 / (cu * cu)
    out = gamma_map(plane, 5, cu, "reflect101")
    middle = inside & (ci < c_max(cu))
    alpha = (1 + cu * cu) / (ci[middle] ** 2 - cu * cu)
    r, mean, z = out[middle], m[middle], plane[middle]
    residual = alpha * r * r - (alpha - looks - 1) * mean * r - looks * z * mean
    if not np.allclose(residual / (alpha * mean * mean), 0, atol=1e-9):
        _fail("Gamma-MAP value does not solve its quadratic")
    # With a huge speckle scale, c is 1 everywhere and SRAD is the linear heat equation.
    heat = np.pad(plane, 3, mode="reflect")
    for _ in range(3):
        e = np.pad(heat, 1, mode="edge")
        heat = heat + 0.2 / 4 * (e[:-2, 1:-1] + e[2:, 1:-1] + e[1:-1, :-2] + e[1:-1, 2:] - 4 * heat)
    if not np.allclose(srad(plane, 3, 0.2, 1e6, 0.0, "reflect101"), heat[3:-3, 3:-3]):
        _fail("SRAD with a huge speckle scale is not linear diffusion")


def add_speckle_cases(plane: FloatArray, add: Add) -> dict[str, FloatArray]:
    """Add the speckle cases. They run on the plane plus 20, so every value is above 0."""
    speckled = plane + 20
    _cross_checks(speckled)
    for border in PAD_MODES:
        for size, cu in ((5, 0.25), (7, 0.15)):
            params = {"size": size, "cu": cu, "border": border}
            add(
                "lee",
                params,
                lee(speckled, size, cu, border),
                "NumPy windows, checked at C_u = 0",
                "bright",
            )
            add(
                "kuan",
                params,
                kuan(speckled, size, cu, border),
                "NumPy windows, checked against the Lee weights",
                "bright",
            )
            add(
                "gamma-map",
                params,
                gamma_map(speckled, size, cu, border),
                "NumPy windows, checked against its quadratic",
                "bright",
            )
            add(
                "enhanced-lee",
                {**params, "damping": 1.0},
                enhanced_lee(speckled, size, cu, 1.0, border),
                "NumPy windows with the three classes of Lopes",
                "bright",
            )
        for size, k in ((5, 1.0), (7, 2.5)):
            add(
                "frost",
                {"size": size, "damping": k, "border": border},
                frost(speckled, size, k, border),
                "NumPy windows, checked against the box mean at K = 0",
                "bright",
            )
        add(
            "srad",
            {"iterations": 4, "dt": 0.2, "q0": 0.3, "rho": 1 / 6, "border": border},
            srad(speckled, 4, 0.2, 0.3, 1 / 6, border),
            "NumPy, checked against linear diffusion for a huge speckle scale",
            "bright",
        )
    return {"bright": speckled}
