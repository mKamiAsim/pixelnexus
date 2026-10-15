"""Wavelet filters: shrink the detail coefficients of a 2-D discrete wavelet transform.

PyWavelets computes the transform (wavedec2 and waverec2) and supplies the filter taps. The
noise estimate, the thresholds (VisuShrink, BayesShrink and SureShrink) and the shrink rules
are our own code, so the Inspector and the docs can show each step.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pywt
from numpy.typing import NDArray
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


def shrink(detail: Coefficients, threshold: float, mode: str) -> Coefficients:
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
    shrunk = [coeffs[0]] + [
        tuple(shrink(band, t, params["mode"]) for band, t in zip(level, ts, strict=True))
        for level, ts in zip(coeffs[1:], thresholds, strict=True)
    ]
    out: Plane = pywt.waverec2(shrunk, wavelet, mode=mode)
    # An odd size comes back one sample larger.
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


def wavelet_threshold_representation(params: dict[str, Any]) -> dict[str, Any]:
    """The stages of the filter for the Inspector, with the filter taps from PyWavelets."""
    wavelet = pywt.Wavelet(params["wavelet"])
    levels = params["levels"]
    rule = params["rule"]
    sigma = params["sigma"]
    noise = (
        f"\\sigma = {sigma:g}"
        if sigma
        else "\\hat{\\sigma} = \\operatorname{median}(|d_1|)\\, /\\, 0.6745"
    )
    threshold = f"T = {params['threshold']:g}" if rule == "manual" else THRESHOLD_FORMULAS[rule]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Analysis",
                "formula": (
                    f"\\big(a_J,\\ (h_j, v_j, d_j)_{{j=1}}^{{J}}\\big) = "
                    f"\\operatorname{{DWT}}(I),\\quad J = {levels}"
                ),
                "note": (
                    f"PyWavelets wavedec2 with the {wavelet.name} wavelet, "
                    f"{wavelet.dec_len} taps per filter. J is capped at the deepest level "
                    "the image size allows."
                ),
            },
            {
                "name": "Filter taps",
                "formula": (
                    f"\\begin{{aligned}} f_{{\\text{{low}}}} &= ({_taps(wavelet.dec_lo)}) \\\\ "
                    f"f_{{\\text{{high}}}} &= ({_taps(wavelet.dec_hi)}) \\end{{aligned}}"
                ),
                "note": "The analysis filters of PyWavelets, rounded to 4 decimals.",
            },
            {
                "name": "Noise level",
                "formula": noise,
                "note": "d_1 holds the diagonal details of the finest level. Zeros are left out."
                if not sigma
                else "Set by the Noise sigma parameter.",
            },
            {
                "name": "Threshold",
                "formula": threshold,
                "note": {
                    "manual": "The same threshold for every detail subband.",
                    "visushrink": "One threshold for every subband. N is the number of pixels.",
                    "bayesshrink": "One threshold per subband b with n_b coefficients.",
                    "sureshrink": (
                        "One threshold per subband b. A sparse subband, where "
                        "(sum x^2 - n_b) / n_b <= (log2 n_b)^1.5 / sqrt(n_b), "
                        "gets sigma sqrt(2 ln n_b) instead."
                    ),
                }[rule],
            },
            {"name": "Shrink", "formula": SHRINK_FORMULAS[params["mode"]]},
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


@register("wavelet-threshold", representation=wavelet_threshold_representation)
def wavelet_threshold(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: wavelet_threshold_plane(plane, params),
        progress,
    )
