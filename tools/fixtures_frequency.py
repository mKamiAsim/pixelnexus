"""Reference results for the frequency-domain filters of Phase 5e.

tools/fixtures_filters.py adds these one-plane cases to web/tests/fixtures/filters.json. Each
reference extends the plane with numpy.pad as web/src/core/filters/frequency/spectral.ts does,
filters it with numpy.fft and crops it. Before the cases are written, the script checks the
Gaussian low-pass filter against scipy.ndimage.gaussian_filter and the complement rules.
"""

from __future__ import annotations

import functools
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


ComplexArray = NDArray[np.complex128]
# Builds H from the spectrum and the frequencies of its columns and rows.
SpectrumResponse = Callable[[ComplexArray, FloatArray, FloatArray], FloatArray]


def spectral_complex(plane: FloatArray, border: str, build: SpectrumResponse) -> ComplexArray:
    """Extend, transform, multiply by H, transform back and crop. Returns the complex result."""
    h, w = plane.shape
    mx, my = margin(w), margin(h)
    width, height = next_fast(w + 2 * mx), next_fast(h + 2 * my)
    pad = ((my, height - h - my), (mx, width - w - mx))
    extended = np.pad(plane, pad, mode=cast(Any, PAD_MODES[border]))
    spectrum = np.fft.fft2(extended)
    result = np.fft.ifft2(spectrum * build(spectrum, np.fft.fftfreq(width), np.fft.fftfreq(height)))
    return np.asarray(result[my : my + h, mx : mx + w], dtype=np.complex128)


def spectral_filter(plane: FloatArray, border: str, build: SpectrumResponse) -> FloatArray:
    """The real part of spectral_complex."""
    return np.asarray(spectral_complex(plane, border, build).real, dtype=np.float64)


def frequency_filter(plane: FloatArray, border: str, response: Response) -> FloatArray:
    """Filter with a response H(fx, fy) that does not depend on the image."""
    return spectral_filter(plane, border, lambda _s, fx, fy: response(fx[None, :], fy[:, None]))


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


Notch = tuple[float, float]

MIRROR_MODES = ("reflect", "reflect101")


def notch_centers(notches: list[Notch], mirror_axes: bool) -> list[Notch]:
    """Each notch and its mirror point; with a mirror border also the mirror points across axes."""
    centers: list[Notch] = []
    for u, v in notches:
        centers += [(u, v), (-u, -v)]
        if mirror_axes and u != 0 and v != 0:
            centers += [(-u, v), (u, -v)]
    return centers


def notch_response(
    notches: list[Notch], shape: str, d0: float, order: float, pass_: bool, mirror_axes: bool
) -> Response:
    """The product of high-pass filters at the notch centers, Gonzalez and Woods."""

    def factor(d: FloatArray) -> FloatArray:
        if shape == "ideal":
            return np.where(d <= d0, 0.0, 1.0)
        if shape == "butterworth":
            safe = np.where(d == 0, 1.0, d)
            return np.where(d == 0, 0.0, 1 / (1 + (d0 / safe) ** (2 * order)))
        return 1 - np.exp(-(d * d) / (2 * d0 * d0))

    centers = notch_centers(notches, mirror_axes)

    def response(fx: FloatArray, fy: FloatArray) -> FloatArray:
        h = np.ones(np.broadcast_shapes(fx.shape, fy.shape))
        for u, v in centers:
            h = h * factor(np.hypot(fx - u, fy - v))
        return 1 - h if pass_ else h

    return response


def harmonics(fx: float, fy: float, count: int) -> list[Notch]:
    return [
        (k * fx, k * fy)
        for k in range(1, count + 1)
        if abs(k * fx) <= 0.5 and abs(k * fy) <= 0.5 and (fx != 0 or fy != 0)
    ]


PEAK_TOLERANCE = 1e-9


def windowed_spectrum(plane: FloatArray) -> tuple[ComplexArray, FloatArray, FloatArray]:
    """The plane minus its mean, times a 2D numpy.hanning window, zero padded to a fast size."""
    h, w = plane.shape
    width, height = next_fast(w), next_fast(h)
    window = np.outer(np.hanning(h), np.hanning(w)) if h > 1 and w > 1 else np.ones((h, w))
    padded = np.zeros((height, width))
    padded[:h, :w] = (plane - plane.mean()) * window
    return np.fft.fft2(padded), np.fft.fftfreq(width), np.fft.fftfreq(height)


def find_peaks(
    spectrum: ComplexArray,
    fx: FloatArray,
    fy: FloatArray,
    min_frequency: float,
    threshold: float,
    max_peaks: int,
) -> list[Notch]:
    """Local maxima of ln(1 + |F|) that rise above the lower median of their ring, half plane."""
    log = np.log1p(np.abs(spectrum))
    height, width = log.shape
    step = 1 / max(width, height)
    rings = np.floor(np.hypot(fx[None, :], fy[:, None]) / step + 0.5).astype(int)
    medians: dict[int, float] = {}
    for ring in np.unique(rings):
        values = np.sort(log[rings == ring])
        medians[int(ring)] = float(values[(len(values) - 1) // 2])
    found: list[tuple[float, float, float]] = []
    for j in range(height):
        v = float(fy[j])
        for i in range(width):
            u = float(fx[i])
            if v < 0 or (v == 0 and u <= 0) or math.hypot(u, v) < min_frequency:
                continue
            value = float(log[j, i])
            rows = [(j + d) % height for d in range(-2, 3)]
            cols = [(i + d) % width for d in range(-2, 3)]
            if (log[np.ix_(rows, cols)] > value + PEAK_TOLERANCE * abs(value)).any():
                continue
            excess = value - medians[int(rings[j, i])]
            if excess >= threshold:
                found.append((excess, v, u))

    def order(a: tuple[float, float, float], b: tuple[float, float, float]) -> int:
        scale = PEAK_TOLERANCE * max(abs(a[0]), abs(b[0]))
        if abs(a[0] - b[0]) > scale:
            return -1 if a[0] > b[0] else 1
        return -1 if (a[1], a[2]) < (b[1], b[2]) else (1 if (a[1], a[2]) > (b[1], b[2]) else 0)

    found.sort(key=functools.cmp_to_key(order))
    return [(u, v) for _e, v, u in found[:max_peaks]]


def suppress_periodic(
    plane: FloatArray,
    border: str,
    min_frequency: float,
    threshold: float,
    max_peaks: int,
    d0: float,
) -> tuple[FloatArray, list[Notch]]:
    peaks = find_peaks(*windowed_spectrum(plane), min_frequency, threshold, max_peaks)
    response = notch_response(peaks, "gaussian", d0, 1, False, border in MIRROR_MODES)
    return frequency_filter(plane, border, response), peaks


def periodic_noise(
    plane: FloatArray, amplitude: float, fx: float, fy: float, phase: float
) -> FloatArray:
    y, x = np.mgrid[0 : plane.shape[0], 0 : plane.shape[1]].astype(np.float64)
    wave = np.sin(2 * np.pi * (fx * x + fy * y) + phase * np.pi / 180)
    return np.asarray(plane + amplitude * wave, dtype=np.float64)


def _periodic_input(plane: FloatArray) -> FloatArray:
    """The test plane, dimmed, with an oblique wave on top, as whole numbers from 0 to 255."""
    wave = periodic_noise(np.zeros_like(plane), 70, 0.25, 0.1, 0)
    return np.clip(np.round(60 + 0.4 * plane + wave), 0, 255)


def _notch_checks() -> None:
    # Oblique waves that fit the image a whole number of times and not, on a smooth ramp. The
    # peaks are found next to the wave frequency, and in the center of the image, away from the
    # edges where the cut-off wave leaks, the suppression leaves less than 5 percent of the wave.
    y, x = np.mgrid[0:96, 0:128].astype(np.float64)
    ramp = 80 + 0.6 * x + 0.4 * y
    center = np.s_[24:-24, 32:-32]
    for f, g in ((0.125, 0.0625), (0.13, 0.05)):
        noisy = periodic_noise(ramp, 40, f, g, 0)
        for border in ("reflect", "wrap", "reflect101"):
            cleaned, peaks = suppress_periodic(noisy, border, 0.05, 3, 8, 0.02)
            near = [p for p in peaks if abs(abs(p[0]) - f) < 0.01 and abs(p[1] - g) < 0.01]
            if not near:
                _fail(f"periodic noise suppression found {peaks}, not the wave at ({f}, {g})")
            if np.sqrt(((cleaned - ramp)[center] ** 2).mean()) > 0.05 * 40:
                _fail(
                    f"periodic noise suppression leaves more than 5 percent of the wave, {border}"
                )
            response = notch_response([(f, g)], "gaussian", 0.02, 1, False, border in MIRROR_MODES)
            rejected = frequency_filter(noisy, border, response)
            if np.sqrt(((rejected - ramp)[center] ** 2).mean()) > 0.05 * 40:
                _fail(f"a notch at the wave leaves more than 5 percent of the wave, {border}")


def add_notch_cases(plane: FloatArray, add: Add) -> dict[str, FloatArray]:
    _notch_checks()
    source = "numpy.fft on the plane extended with numpy.pad"
    notches = [(0.2, 0.1), (-0.15, 0.3)]
    text = "0.2 0.1; -0.15 0.3"
    for shape, d0, order in (("ideal", 0.06, 1), ("butterworth", 0.03, 2), ("gaussian", 0.03, 1)):
        for border in ("reflect", "wrap"):
            for filter_id, pass_ in (("notch-reject", False), ("notch-pass", True)):
                params: dict[str, Any] = {
                    "notches": text,
                    "shape": shape,
                    "radius": d0,
                    "border": border,
                }
                if shape == "butterworth":
                    params["order"] = order
                mirror = border in MIRROR_MODES
                response = notch_response(notches, shape, d0, order, pass_, mirror)
                add(filter_id, params, frequency_filter(plane, border, response), source)
    for fx, fy, count, shape, d0, border in (
        (0.1, 0.05, 4, "gaussian", 0.02, "reflect"),
        (0, 0.12, 3, "butterworth", 0.02, "reflect101"),
        (0.11, -0.06, 3, "ideal", 0.03, "replicate"),
    ):
        params = {
            "fx": fx,
            "fy": fy,
            "harmonics": count,
            "shape": shape,
            "radius": d0,
            "order": 2,
            "border": border,
        }
        mirror = border in MIRROR_MODES
        response = notch_response(harmonics(fx, fy, count), shape, d0, 2, False, mirror)
        add("comb", params, frequency_filter(plane, border, response), source)
    periodic = _periodic_input(plane)
    for border, threshold, max_peaks in (
        ("reflect", 1.0, 4),
        ("wrap", 1.0, 2),
        ("reflect101", 0.5, 8),
    ):
        params = {
            "minFrequency": 0.08,
            "threshold": threshold,
            "maxPeaks": max_peaks,
            "radius": 0.03,
            "border": border,
        }
        cleaned, _peaks = suppress_periodic(periodic, border, 0.08, threshold, max_peaks, 0.03)
        add(
            "periodic-noise",
            params,
            cleaned,
            source + " and the peak rule of periodic-noise",
            "periodic",
        )
    for amplitude, fx, fy, phase in ((30, 0.13, -0.07, 40), (12, 0.25, 0, 0)):
        params = {"amplitude": amplitude, "fx": fx, "fy": fy, "phase": phase}
        add("noise-periodic", params, periodic_noise(plane, amplitude, fx, fy, phase), "numpy.sin")
    return {"periodic": periodic}


def homomorphic(
    plane: FloatArray, border: str, low: float, high: float, c: float, d0: float
) -> FloatArray:
    """exp(s) - 1 for s the high-emphasis filtering of ln(1 + f), Gonzalez and Woods."""

    def response(fx: FloatArray, fy: FloatArray) -> FloatArray:
        return (high - low) * (1 - np.exp(-c * (fx * fx + fy * fy) / (d0 * d0))) + low

    logged = np.log1p(np.maximum(plane, 0))
    return np.asarray(np.expm1(frequency_filter(logged, border, response)), dtype=np.float64)


# Magnitudes below this share of the largest one count as 0, as in shaping.ts.
ZERO = 1e-9


def _magnitudes(spectrum: ComplexArray) -> tuple[FloatArray, float, float]:
    m = np.abs(spectrum)
    return m, float(m.mean()), ZERO * float(m.max())


def phase_only_gain(spectrum: ComplexArray, _fx: FloatArray, _fy: FloatArray) -> FloatArray:
    m, mean, floor = _magnitudes(spectrum)
    return np.where(m > floor, mean / np.where(m > floor, m, 1), 0.0)


def whitening_gain(strength: float) -> SpectrumResponse:
    def build(spectrum: ComplexArray, fx: FloatArray, fy: FloatArray) -> FloatArray:
        m, mean, floor = _magnitudes(spectrum)
        step = 1 / max(len(fx), len(fy))
        rings = np.floor(np.hypot(fx[None, :], fy[:, None]) / step + 0.5).astype(int)
        sums = np.bincount(rings.ravel(), weights=m.ravel())
        sizes = np.bincount(rings.ravel())
        a = (sums / np.maximum(sizes, 1))[rings]
        gain = np.where(a > floor, (mean / np.where(a > floor, a, 1)) ** strength, 0.0)
        # Ring 0 is frequency 0, the mean brightness, which is kept.
        return np.where(rings == 0, 1.0, gain)

    return build


def log_gabor_response(
    wavelength: float, sigma_on_f: float, angle: float, angular_sigma: float, oriented: bool
) -> Response:
    """Field's radial log-Gabor function times Kovesi's angular Gaussian, y axis down."""
    f0 = 1 / wavelength
    a0, s0 = math.radians(angle), math.radians(angular_sigma)

    def response(fx: FloatArray, fy: FloatArray) -> FloatArray:
        f = np.sqrt(fx * fx + fy * fy)
        with np.errstate(divide="ignore"):
            radial = np.where(
                f == 0,
                0.0,
                np.exp(
                    -(np.log(np.where(f == 0, 1, f) / f0) ** 2) / (2 * math.log(sigma_on_f) ** 2)
                ),
            )
        if not oriented:
            return np.asarray(radial, dtype=np.float64)
        theta = np.arctan2(-fy, fx)
        ds = np.sin(theta) * math.cos(a0) - np.cos(theta) * math.sin(a0)
        dc = np.cos(theta) * math.cos(a0) + np.sin(theta) * math.sin(a0)
        d_theta = np.abs(np.arctan2(ds, dc))
        return np.asarray(radial * np.exp(-(d_theta**2) / (2 * s0 * s0)), dtype=np.float64)

    return response


def wiener_gain(sigma: float) -> SpectrumResponse:
    def build(spectrum: ComplexArray, _fx: FloatArray, _fy: FloatArray) -> FloatArray:
        power = np.abs(spectrum) ** 2 / spectrum.size
        mean = ndimage.uniform_filter(power, size=5, mode="wrap")
        return np.where(
            mean > 0, np.maximum(0, 1 - sigma * sigma / np.where(mean > 0, mean, 1)), 0.0
        )

    return build


def _shaping_checks(plane: FloatArray) -> None:
    for border in ("reflect", "wrap"):
        if not np.allclose(homomorphic(plane, border, 1, 1, 1, 0.1), plane, atol=1e-6):
            _fail("homomorphic filtering with both gammas 1 does not keep the image")
        if not np.allclose(spectral_filter(plane, border, whitening_gain(0)), plane, atol=1e-6):
            _fail("spectral whitening with strength 0 does not keep the image")
        if not np.allclose(spectral_filter(plane, border, wiener_gain(0)), plane, atol=1e-6):
            _fail("the Wiener filter with noise 0 does not keep the image")
    gain = phase_only_gain(np.fft.fft2(plane), np.zeros(1), np.zeros(1))
    if not np.allclose(np.abs(np.fft.fft2(plane) * gain), np.abs(np.fft.fft2(plane)).mean()):
        _fail("the phase-only gain does not give every frequency the mean magnitude")


def add_shaping_cases(plane: FloatArray, add: Add) -> None:
    _shaping_checks(plane)
    source = "numpy.fft on the plane extended with numpy.pad"
    for low, high, c, d0, border in ((0.5, 2, 1, 0.1, "reflect"), (0.3, 1.5, 2, 0.05, "wrap")):
        params = {
            "gammaLow": low,
            "gammaHigh": high,
            "sharpness": c,
            "cutoff": d0,
            "border": border,
        }
        add("homomorphic", params, homomorphic(plane, border, low, high, c, d0), source)
    for border in ("reflect", "reflect101"):
        add(
            "phase-only",
            {"border": border},
            spectral_filter(plane, border, phase_only_gain),
            source,
        )
    for strength, border in ((1.0, "reflect"), (0.5, "replicate")):
        output = spectral_filter(plane, border, whitening_gain(strength))
        add("spectral-whitening", {"strength": strength, "border": border}, output, source)
    oriented = log_gabor_response(6, 0.55, 30, 25, True)
    result = spectral_complex(
        plane, "reflect", lambda _s, fx, fy: oriented(fx[None, :], fy[:, None])
    )
    values = {"magnitude": np.abs(result), "real": result.real, "imaginary": result.imag}
    for output_part in ("magnitude", "real", "imaginary"):
        params = {
            "wavelength": 6,
            "sigmaOnf": 0.55,
            "angle": 30,
            "angularSigma": 25,
            "oriented": True,
            "output": output_part,
            "border": "reflect",
        }
        add("log-gabor", params, np.asarray(values[output_part], dtype=np.float64), source)
    params = {"wavelength": 5, "sigmaOnf": 0.65, "oriented": False, "border": "wrap"}
    response = log_gabor_response(5, 0.65, 0, 25, False)
    add("log-gabor", params, frequency_filter(plane, "wrap", response), source)
    for sigma, border in ((10.0, "reflect"), (25.0, "wrap")):
        output = spectral_filter(plane, border, wiener_gain(sigma))
        add("wiener-denoise", {"noiseSigma": sigma, "border": border}, output, source)


def add_frequency_cases(plane: FloatArray, add: Add) -> dict[str, FloatArray]:
    _checks()
    add_shaping_cases(plane, add)
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
    return add_notch_cases(plane, add)
