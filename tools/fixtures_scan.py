"""Reference results for the adaptive scan filters: 2D LMS, 2D RLS and the Kalman smoother.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Each
reference is written from the update equations with NumPy, in plain loops, and is checked against
a limiting case before it is used:

- LMS with step size 0 keeps its first weights, so it gives the mean of the neighbors.
- RLS with lambda 1 gives, at every pixel, the weights of a regularized least-squares fit to all
  pixels before it, solved here directly with numpy.linalg.solve.
- The Kalman smoother with almost no noise gives the image back.
- RLS with lambda 0.99 on a large flat image stays bounded, which needs the safeguard.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from fixtures_rank import PAD_MODES

FloatArray = NDArray[np.float64]
Add = Callable[..., None]


def _fail(message: str) -> None:
    raise SystemExit(message)


def neighbor_rows(plane: FloatArray, size: int, border: str) -> FloatArray:
    """For each pixel in raster order, its window without the center, scaled to 0 to 1."""
    r = (size - 1) // 2
    padded = np.pad(plane / 255.0, r, mode=PAD_MODES[border])  # type: ignore[call-overload]
    h, w = plane.shape
    rows = []
    for y in range(h):
        for x in range(w):
            window = padded[y : y + size, x : x + size].ravel()
            rows.append(np.delete(window, (size * size) // 2))
    return np.array(rows)


def lms(plane: FloatArray, size: int, mu: float, output: str, border: str) -> FloatArray:
    xs = neighbor_rows(plane, size, border)
    d = (plane / 255.0).ravel()
    m = size * size - 1
    w = np.full(m, 1.0 / m)
    out = np.zeros(d.size)
    for k in range(d.size):
        x = xs[k]
        prediction = float(w @ x)
        e = d[k] - prediction
        w = w + mu * e * x / (1e-6 + float(x @ x))
        out[k] = 128 + 255 * e if output == "error" else 255 * prediction
    return out.reshape(plane.shape)


def rls(
    plane: FloatArray, size: int, lam: float, delta: float, output: str, border: str
) -> FloatArray:
    xs = neighbor_rows(plane, size, border)
    d = (plane / 255.0).ravel()
    m = size * size - 1
    w = np.full(m, 1.0 / m)
    p = np.eye(m) / delta
    cap = m / delta
    out = np.zeros(d.size)
    for k in range(d.size):
        x = xs[k]
        prediction = float(w @ x)
        e = d[k] - prediction
        pi = p @ x
        gain = pi / (lam + float(x @ pi))
        w = w + gain * e
        p = (p - np.outer(gain, pi)) / lam
        # The studio's safeguard against rounding and windup: symmetric, trace capped at start.
        p = (p + p.T) / 2
        trace = float(np.trace(p))
        if trace > cap:
            p = p * (cap / trace)
        out[k] = 128 + 255 * e if output == "error" else 255 * prediction
    return out.reshape(plane.shape)


def ar_model(lines: list[FloatArray], noise_variance: float) -> tuple[float, float, float]:
    values = np.concatenate(lines)
    mean = float(values.mean())
    variance = max(float(((values - mean) ** 2).mean()) - noise_variance, 1e-6)
    lag = np.concatenate([(line[1:] - mean) * (line[:-1] - mean) for line in lines])
    rho = min(max(float(lag.mean()) / variance, 0.0), 0.999)
    return mean, rho, variance


def kalman_line(
    y: FloatArray, model: tuple[float, float, float], noise_variance: float
) -> tuple[FloatArray, float]:
    mean, rho, variance = model
    q = variance * (1 - rho * rho)
    n = y.size
    xf, pf, xp, pp = np.zeros(n), np.zeros(n), np.zeros(n), np.zeros(n)
    state, p = 0.0, variance
    for k in range(n):
        s = 0.0 if k == 0 else rho * state
        sp = variance if k == 0 else rho * rho * p + q
        gain = sp / (sp + noise_variance)
        state = s + gain * (y[k] - mean - s)
        p = (1 - gain) * sp
        xp[k], pp[k], xf[k], pf[k] = s, sp, state, p
    xs, ps = xf.copy(), pf.copy()
    for k in range(n - 2, -1, -1):
        g = pf[k] * rho / pp[k + 1]
        xs[k] = xf[k] + g * (xs[k + 1] - xp[k + 1])
        ps[k] = pf[k] + g * g * (ps[k + 1] - pp[k + 1])
    return xs + mean, float(ps.mean())


def kalman(plane: FloatArray, sigma: float) -> FloatArray:
    """The mean of a run along the rows and a run along the columns of the noisy image."""
    noise = sigma * sigma
    rows = [plane[j].astype(np.float64) for j in range(plane.shape[0])]
    columns = [plane[:, i].astype(np.float64) for i in range(plane.shape[1])]
    row_model, column_model = ar_model(rows, noise), ar_model(columns, noise)
    across = np.array([kalman_line(r, row_model, noise)[0] for r in rows])
    down = np.stack([kalman_line(c, column_model, noise)[0] for c in columns], axis=1)
    return (across + down) / 2


def _cross_checks(plane: FloatArray) -> None:
    mean_kernel = np.ones((3, 3)) / 8
    mean_kernel[1, 1] = 0
    expected = ndimage.correlate(plane, mean_kernel, mode="mirror")
    if not np.allclose(lms(plane, 3, 0.0, "prediction", "reflect101"), expected):
        _fail("LMS with step size 0 is not the mean of the neighbors")

    small = plane[:6, :7]
    xs = neighbor_rows(small, 3, "reflect101")
    d = (small / 255.0).ravel()
    delta = 0.5
    got = rls(small, 3, 1.0, delta, "prediction", "reflect101").ravel() / 255
    w0 = np.full(8, 1 / 8)
    for k in (5, 20, 41):
        # The weights before pixel k fit pixels 0 to k - 1, with the start w0 as a prior.
        a = delta * np.eye(8) + xs[:k].T @ xs[:k]
        w = np.linalg.solve(a, delta * w0 + xs[:k].T @ d[:k])
        if not np.isclose(got[k], w @ xs[k]):
            _fail("RLS with lambda 1 is not the regularized least-squares fit")

    if not np.allclose(kalman(plane, 1e-3), plane, atol=1e-2):
        _fail("The Kalman smoother without noise does not give the image back")

    flat = np.full((60, 60), 120.0) + np.random.default_rng(2).normal(0, 1, (60, 60))
    if np.abs(rls(flat, 3, 0.99, 0.01, "prediction", "reflect101") - flat).max() > 20:
        _fail("RLS with forgetting winds up on a flat image")


def add_scan_cases(plane: FloatArray, add: Add) -> None:
    _cross_checks(plane)
    for border in ("reflect101", "replicate", "constant"):
        for size in (3, 5):
            for output in ("prediction", "error"):
                params = {"size": size, "mu": 0.05, "output": output, "border": border}
                add("lms-2d", params, lms(plane, size, 0.05, output, border),
                    "NumPy loop of the normalized LMS update")  # fmt: skip
        params = {"size": 3, "lambda": 0.98, "delta": 0.01, "output": "prediction",
                  "border": border}  # fmt: skip
        add("rls-2d", params, rls(plane, 3, 0.98, 0.01, "prediction", border),
            "NumPy loop of the RLS update")  # fmt: skip
    params = {"size": 5, "lambda": 0.995, "delta": 0.1, "output": "error", "border": "reflect101"}
    add("rls-2d", params, rls(plane, 5, 0.995, 0.1, "error", "reflect101"),
        "NumPy loop of the RLS update")  # fmt: skip
    for sigma in (5, 20, 40):
        add("kalman", {"sigma": sigma, "border": "reflect101"}, kalman(plane, sigma),
            "NumPy Kalman filter and Rauch-Tung-Striebel smoother, rows then columns")  # fmt: skip
