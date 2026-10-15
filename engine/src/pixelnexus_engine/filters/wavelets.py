"""Wavelet filters: shrink the detail coefficients of a 2-D wavelet transform.

* wavelet-threshold: the decimated transform (wavedec2 and waverec2) with a threshold rule.
* swt-denoise: the same rules on the stationary transform (swt2 and iswt2), or cycle spinning.
* wavelet-wiener: a Wiener gain from the local signal variance of each coefficient.

PyWavelets computes the transforms and supplies the filter taps. The noise estimate, the
thresholds (VisuShrink, BayesShrink and SureShrink), the shrink rules and the Wiener gains are
our own code, so the Inspector and the docs can show each step.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pywt
from numpy.typing import NDArray
from scipy import ndimage
from scipy.special import ndtri

from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

# The 75th percentile of the standard normal distribution, about 0.6745. For Gaussian noise of
# standard deviation sigma, the median of |w| is sigma times this number.
NORMAL_Q75 = float(ndtri(0.75))

# PyWavelets extension modes for the studio's border modes. Both show "d c b a | a b c d" for
# reflect, "d c b | a b c d" for reflect 101, and so on.
EXTENSION = {
    "reflect": "symmetric",
    "reflect101": "reflect",
    "replicate": "constant",
    "constant": "zero",
    "wrap": "periodic",
}

# NumPy pad modes for the same border modes, for the rows and columns the stationary transform
# needs to reach a multiple of 2^J.
PAD = {
    "reflect": "symmetric",
    "reflect101": "reflect",
    "replicate": "edge",
    "constant": "constant",
    "wrap": "wrap",
}

Coefficients = NDArray[np.float64]


def estimate_sigma(detail: Coefficients) -> float:
    """Noise standard deviation from the median absolute value of fine detail coefficients.

    Donoho and Johnstone's estimate, median(|w|) / 0.6745. Coefficients that are exactly 0, as
    in flat or clipped areas, are left out, as in scikit-image.
    """
    values = np.abs(detail[detail != 0])
    if values.size == 0:
        return 0.0
    return float(np.median(values)) / NORMAL_Q75


def universal_threshold(sigma: float, count: int) -> float:
    """VisuShrink: sigma sqrt(2 ln N) for N samples."""
    return sigma * math.sqrt(2 * math.log(count))


def bayes_threshold(detail: Coefficients, sigma: float) -> float:
    """BayesShrink for one subband: sigma^2 / sigma_x, with sigma_x^2 = mean(w^2) - sigma^2.

    When the subband variance does not exceed the noise variance, sigma_x is replaced by the
    square root of the machine epsilon, so the threshold is huge and the subband becomes 0.
    scikit-image does the same.
    """
    signal = float(np.mean(detail * detail)) - sigma * sigma
    return sigma * sigma / math.sqrt(max(signal, float(np.finfo(np.float64).eps)))


def sure_minimizer(x: Coefficients, limit: float) -> float:
    """The t from 0 to limit that minimizes SURE(t; x) for soft thresholding with unit noise.

    SURE(t; x) = d - 2 #{i : |x_i| <= t} + sum_i min(|x_i|, t)^2. Between two neighboring
    values of |x_i| it grows with t, so the minimum is at 0 or at one of the |x_i|. Ties go to
    the smallest t.
    """
    d = x.size
    values = np.sort(np.abs(x).ravel())
    values = values[values <= limit]
    k = np.arange(1, values.size + 1)
    squares = values * values
    risks = d - 2 * k + np.cumsum(squares) + (d - k) * squares
    zero_risk = d - 2 * int(np.count_nonzero(x == 0))
    if values.size == 0 or zero_risk <= risks.min():
        return 0.0
    return float(values[int(np.argmin(risks))])


def sure_threshold(detail: Coefficients, sigma: float) -> float:
    """SureShrink for one subband of d coefficients, with Donoho and Johnstone's hybrid rule.

    With x = w / sigma, s^2 = (sum x_i^2 - d) / d and gamma = (log2 d)^(3/2) / sqrt(d). A sparse
    subband (s^2 <= gamma) gets the universal threshold sqrt(2 ln d). Otherwise the threshold
    minimizes SURE from 0 to sqrt(2 ln d). Both are multiplied by sigma.
    """
    if sigma <= 0:
        return 0.0
    x = detail.ravel() / sigma
    d = x.size
    universal = math.sqrt(2 * math.log(d))
    spread = (float(np.sum(x * x)) - d) / d
    gamma = math.log2(d) ** 1.5 / math.sqrt(d)
    if spread <= gamma:
        return sigma * universal
    return sigma * sure_minimizer(x, universal)


def shrink(detail: Coefficients, threshold: float | Coefficients, mode: str) -> Coefficients:
    """Soft: sign(w) max(|w| - T, 0). Hard: w where |w| >= T, else 0. As pywt.threshold."""
    magnitude = np.abs(detail)
    if mode == "hard":
        return np.where(magnitude >= threshold, detail, 0.0)
    return np.sign(detail) * np.maximum(magnitude - threshold, 0.0)


def decomposition_levels(shape: tuple[int, ...], wavelet: pywt.Wavelet, wanted: int) -> int:
    """The levels asked for, capped at the deepest level PyWavelets allows for the size."""
    return min(wanted, int(pywt.dwtn_max_level(shape, wavelet)))


def subband_thresholds(
    coeffs: list[Any], params: dict[str, Any], sigma: float, count: int
) -> list[list[float]]:
    """One threshold for each detail subband (H, V, D), from the coarsest level to the finest."""
    rule = params["rule"]
    out = []
    for level in coeffs[1:]:
        if rule == "manual":
            out.append([float(params["threshold"])] * 3)
        elif rule == "visushrink":
            out.append([universal_threshold(sigma, count)] * 3)
        elif rule == "bayesshrink":
            out.append([bayes_threshold(band, sigma) for band in level])
        else:
            out.append([sure_threshold(band, sigma) for band in level])
    return out


def wavelet_threshold_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    """Decompose, shrink every detail subband and rebuild one plane."""
    wavelet = pywt.Wavelet(params["wavelet"])
    mode = EXTENSION[params["border"]]
    levels = decomposition_levels(plane.shape, wavelet, params["levels"])
    if levels < 1:
        return plane
    coeffs = pywt.wavedec2(plane, wavelet, mode=mode, level=levels)
    sigma = params["sigma"] or estimate_sigma(coeffs[-1][2])
    thresholds = subband_thresholds(coeffs, params, sigma, plane.size)
    out: Plane = pywt.waverec2(
        shrink_details(coeffs, thresholds, params["mode"]), wavelet, mode=mode
    )
    # An odd size comes back one sample larger.
    return out[: plane.shape[0], : plane.shape[1]]


def shrink_details(coeffs: list[Any], thresholds: list[list[float]], mode: str) -> list[Any]:
    """Shrink every detail subband with its threshold. The approximation is kept."""
    return [coeffs[0]] + [
        tuple(shrink(band, t, mode) for band, t in zip(level, ts, strict=True))
        for level, ts in zip(coeffs[1:], thresholds, strict=True)
    ]


# Stationary wavelet filtering ---------------------------------------------------------------


def stationary_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    """Threshold the stationary (undecimated) transform of one plane.

    The stationary transform of PyWavelets treats the plane as periodic and needs each side to
    be a multiple of 2^J. Rows and columns are added with the border mode, split between the
    two ends, and cut off at the end. Every subband has as many coefficients as the padded
    plane, and white noise keeps its sigma in each, so the threshold rules apply unchanged.
    """
    wavelet = pywt.Wavelet(params["wavelet"])
    levels = decomposition_levels(plane.shape, wavelet, params["levels"])
    if levels < 1:
        return plane
    step = 2**levels
    extra = [(-size) % step for size in plane.shape]
    pads = [(n // 2, n - n // 2) for n in extra]
    padded = np.pad(plane, pads, mode=PAD[params["border"]])  # type: ignore[call-overload]
    coeffs = pywt.swt2(padded, wavelet, level=levels, trim_approx=True)
    sigma = params["sigma"] or estimate_sigma(coeffs[-1][2])
    thresholds = subband_thresholds(coeffs, params, sigma, plane.size)
    out: Plane = pywt.iswt2(shrink_details(coeffs, thresholds, params["mode"]), wavelet)
    (top, _), (left, _) = pads
    return out[top : top + plane.shape[0], left : left + plane.shape[1]]


def cycle_spin_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    """Average wavelet thresholding over circular shifts of 0 to n - 1 pixels in each direction.

    Coifman and Donoho's cycle spinning. Each shifted copy is thresholded with the decimated
    transform and shifted back. The shifts wrap around, as in scikit-image's cycle_spin.
    """
    count = params["shifts"]
    total = np.zeros_like(plane)
    for dy in range(count):
        for dx in range(count):
            shifted = np.roll(plane, (dy, dx), axis=(0, 1))
            total += np.roll(wavelet_threshold_plane(shifted, params), (-dy, -dx), axis=(0, 1))
    result: Plane = total / (count * count)
    return result


def swt_denoise_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    if params["transform"] == "cycle-spinning":
        return cycle_spin_plane(plane, params)
    return stationary_plane(plane, params)


# Wavelet Wiener filtering -------------------------------------------------------------------

WINDOWS = {"3x3": (3,), "5x5": (5,), "7x7": (7,), "9x9": (9,), "min": (3, 5, 7, 9)}


def local_signal_variance(band: Coefficients, sigma: float, sizes: tuple[int, ...]) -> Coefficients:
    """The local signal variance of each coefficient, after Mihcak et al.

    For a square window of W x W coefficients: max(0, mean of w^2 in the window - sigma^2).
    With several window sizes, the smallest estimate is kept. Windows past the subband edge
    are filled by mirroring, "d c b a | a b c d".
    """
    squares = band * band
    estimates = [
        np.maximum(ndimage.uniform_filter(squares, size=size, mode="reflect") - sigma**2, 0.0)
        for size in sizes
    ]
    smallest: Coefficients = np.minimum.reduce(estimates)
    return smallest


def wiener_gain(variance: Coefficients, sigma: float) -> Coefficients:
    """sigma_x^2 / (sigma_x^2 + sigma^2). Without noise, every coefficient is kept."""
    if sigma <= 0:
        return np.ones_like(variance)
    gain: Coefficients = variance / (variance + sigma**2)
    return gain


def wavelet_wiener_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    """Multiply every detail coefficient by its local Wiener gain and rebuild one plane."""
    wavelet = pywt.Wavelet(params["wavelet"])
    mode = EXTENSION[params["border"]]
    levels = decomposition_levels(plane.shape, wavelet, params["levels"])
    if levels < 1:
        return plane
    coeffs = pywt.wavedec2(plane, wavelet, mode=mode, level=levels)
    sigma = params["sigma"] or estimate_sigma(coeffs[-1][2])
    sizes = WINDOWS[params["window"]]
    filtered = [coeffs[0]] + [
        tuple(
            band * wiener_gain(local_signal_variance(band, sigma, sizes), sigma) for band in level
        )
        for level in coeffs[1:]
    ]
    out: Plane = pywt.waverec2(filtered, wavelet, mode=mode)
    return out[: plane.shape[0], : plane.shape[1]]


def _taps(values: Any) -> str:
    return ",\\ ".join(f"{v:.4f}" for v in values)


THRESHOLD_FORMULAS = {
    "visushrink": "T = \\sigma \\sqrt{2 \\ln N}",
    "bayesshrink": (
        "T_b = \\frac{\\sigma^2}{\\sigma_{x,b}},\\quad "
        "\\sigma_{x,b}^2 = \\max\\Big(\\tfrac{1}{n_b} \\textstyle\\sum w^2 - \\sigma^2,\\ 0\\Big)"
    ),
    "sureshrink": (
        "T_b = \\sigma\\, \\arg\\min_{0 \\le t \\le \\sqrt{2 \\ln n_b}} "
        "\\Big(n_b - 2\\,\\#\\{|x_i| \\le t\\} + \\textstyle\\sum_i \\min(|x_i|, t)^2\\Big),"
        "\\quad x = w / \\sigma"
    ),
}

SHRINK_FORMULAS = {
    "soft": "\\eta_T(w) = \\operatorname{sign}(w)\\, \\max(|w| - T,\\ 0)",
    "hard": "\\eta_T(w) = w\\, [\\,|w| \\ge T\\,]",
}


def _taps_stage(wavelet: pywt.Wavelet) -> dict[str, str]:
    return {
        "name": "Filter taps",
        "formula": (
            f"\\begin{{aligned}} f_{{\\text{{low}}}} &= ({_taps(wavelet.dec_lo)}) \\\\ "
            f"f_{{\\text{{high}}}} &= ({_taps(wavelet.dec_hi)}) \\end{{aligned}}"
        ),
        "note": "The analysis filters of PyWavelets, rounded to 4 decimals.",
    }


def _noise_stage(sigma: float) -> dict[str, str]:
    if sigma:
        return {
            "name": "Noise level",
            "formula": f"\\sigma = {sigma:g}",
            "note": "Set by the Noise sigma parameter.",
        }
    return {
        "name": "Noise level",
        "formula": "\\hat{\\sigma} = \\operatorname{median}(|d_1|)\\, /\\, 0.6745",
        "note": "d_1 holds the diagonal details of the finest level. Zeros are left out.",
    }


def _threshold_stages(params: dict[str, Any]) -> list[dict[str, str]]:
    rule = params["rule"]
    threshold = f"T = {params['threshold']:g}" if rule == "manual" else THRESHOLD_FORMULAS[rule]
    notes = {
        "manual": "The same threshold for every detail subband.",
        "visushrink": "One threshold for every subband. N is the number of pixels.",
        "bayesshrink": "One threshold per subband b with n_b coefficients.",
        "sureshrink": (
            "One threshold per subband b. A sparse subband, where "
            "(sum x^2 - n_b) / n_b <= (log2 n_b)^1.5 / sqrt(n_b), "
            "gets sigma sqrt(2 ln n_b) instead."
        ),
    }
    return [
        {"name": "Threshold", "formula": threshold, "note": notes[rule]},
        {"name": "Shrink", "formula": SHRINK_FORMULAS[params["mode"]]},
    ]


ANALYSIS = (
    "\\big(a_J,\\ (h_j, v_j, d_j)_{{j=1}}^{{J}}\\big) = "
    "\\operatorname{{{name}}}(I),\\quad J = {levels}"
)
LEVEL_CAP = "J is capped at the deepest level the image size allows."


def _analysis_stage(params: dict[str, Any], name: str, how: str) -> dict[str, str]:
    wavelet = pywt.Wavelet(params["wavelet"])
    return {
        "name": "Analysis",
        "formula": ANALYSIS.format(name=name, levels=params["levels"]),
        "note": f"PyWavelets {how} with the {wavelet.name} wavelet, {wavelet.dec_len} taps "
        f"per filter. {LEVEL_CAP}",
    }


def wavelet_threshold_representation(params: dict[str, Any]) -> dict[str, Any]:
    """The stages of the filter for the Inspector, with the filter taps from PyWavelets."""
    return {
        "kind": "stages",
        "stages": [
            _analysis_stage(params, "DWT", "wavedec2"),
            _taps_stage(pywt.Wavelet(params["wavelet"])),
            _noise_stage(params["sigma"]),
            *_threshold_stages(params),
            {
                "name": "Synthesis",
                "formula": (
                    "\\hat{I} = \\operatorname{IDWT}\\big(a_J,\\ "
                    "\\eta_{T}(h_j),\\ \\eta_{T}(v_j),\\ \\eta_{T}(d_j)\\big)"
                ),
                "note": "The approximation a_J is kept as it is.",
            },
        ],
    }


def swt_denoise_representation(params: dict[str, Any]) -> dict[str, Any]:
    """The stages of stationary wavelet filtering or of cycle spinning, for the Inspector."""
    wavelet = pywt.Wavelet(params["wavelet"])
    if params["transform"] == "cycle-spinning":
        count = params["shifts"]
        return {
            "kind": "stages",
            "stages": [
                {
                    "name": "Shift",
                    "formula": (
                        f"I_s = S_s I,\\quad s = (s_y, s_x),\\ 0 \\le s_y, s_x \\le {count - 1}"
                    ),
                    "note": f"{count * count} circular shifts. Pixels that leave one side come "
                    "back on the other.",
                },
                _analysis_stage(params, "DWT", "wavedec2"),
                _taps_stage(wavelet),
                _noise_stage(params["sigma"]),
                *_threshold_stages(params),
                {
                    "name": "Average",
                    "formula": (
                        f"\\hat{{I}} = \\frac{{1}}{{{count * count}}} \\sum_s S_{{-s}}\\, "
                        "\\operatorname{IDWT}\\big(\\eta_T(\\operatorname{DWT}(I_s))\\big)"
                    ),
                    "note": "Each result is shifted back before the average.",
                },
            ],
        }
    return {
        "kind": "stages",
        "stages": [
            _analysis_stage(params, "SWT", "swt2"),
            _taps_stage(wavelet),
            _noise_stage(params["sigma"]),
            *_threshold_stages(params),
            {
                "name": "Synthesis",
                "formula": (
                    "\\hat{I} = \\operatorname{ISWT}\\big(a_J,\\ "
                    "\\eta_{T}(h_j),\\ \\eta_{T}(v_j),\\ \\eta_{T}(d_j)\\big)"
                ),
                "note": "Every subband has one coefficient per pixel, since nothing is "
                "subsampled. The inverse is the average of the rebuilds of all shifted "
                "decimated transforms.",
            },
        ],
    }


def wavelet_wiener_representation(params: dict[str, Any]) -> dict[str, Any]:
    """The stages of wavelet Wiener filtering for the Inspector."""
    sizes = WINDOWS[params["window"]]
    window = "\\min_{W \\in \\{3, 5, 7, 9\\}}" if len(sizes) > 1 else ""
    width = "W" if len(sizes) > 1 else str(sizes[0])
    return {
        "kind": "stages",
        "stages": [
            _analysis_stage(params, "DWT", "wavedec2"),
            _taps_stage(pywt.Wavelet(params["wavelet"])),
            _noise_stage(params["sigma"]),
            {
                "name": "Local variance",
                "formula": (
                    f"\\hat{{\\sigma}}_x^2(k) = {window} \\max\\Big(0,\\ "
                    f"\\frac{{1}}{{{width}^2}} \\sum_{{j \\in N_{{{width}}}(k)}} w_j^2 - "
                    "\\sigma^2\\Big)"
                ),
                "note": "N_W(k) is the W x W window of coefficients around coefficient k, in "
                "the same subband.",
            },
            {
                "name": "Wiener gain",
                "formula": (
                    "\\hat{w}(k) = \\frac{\\hat{\\sigma}_x^2(k)}{\\hat{\\sigma}_x^2(k) + "
                    "\\sigma^2}\\, w(k)"
                ),
                "note": "Every detail coefficient is multiplied by its gain, from 0 to 1.",
            },
            {
                "name": "Synthesis",
                "formula": "\\hat{I} = \\operatorname{IDWT}\\big(a_J,\\ \\hat{w}\\big)",
                "note": "The approximation a_J is kept as it is.",
            },
        ],
    }


@register("wavelet-threshold", representation=wavelet_threshold_representation)
def wavelet_threshold(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: wavelet_threshold_plane(plane, params),
        progress,
    )


@register("swt-denoise", representation=swt_denoise_representation)
def swt_denoise(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: swt_denoise_plane(plane, params),
        progress,
    )


@register("wavelet-wiener", representation=wavelet_wiener_representation)
def wavelet_wiener(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: wavelet_wiener_plane(plane, params),
        progress,
    )
