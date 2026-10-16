"""Phase congruency after Kovesi, in PixelNexus's own code.

The steps follow phasecong3 in Kovesi's ImagePhaseCongruency.jl, which goes with his papers of
1999 and 2003.

* The input is the luma (BT.709) in pixel levels, extended with the border mode for the FFT.
* A bank of log-Gabor filters: nscale scales with the wavelengths minWavelength mult^s, and
  norient directions o pi / norient. The radial part is exp(-(ln(f / f_0))^2 / (2 (ln
  sigmaOnf)^2)), 0 at f = 0, times the low-pass 1 / (1 + (f / 0.45)^30). The angular part is
  the raised cosine (1 + cos(min(norient |d theta| / 2, pi))) / 2 on one side of the spectrum,
  so each response is complex: the real part is the even filter and the imaginary part the odd
  one. As in Kovesi's code, the direction of a frequency is atan2(f_x, f_y), with f_y counting
  down the rows. On screen this is the counterclockwise angle plus 90 degrees. The moments and
  the feature type would be the same with any other start, except at the Nyquist frequency of
  an even size, which belongs to one side of the spectrum only.
* For each direction, the energy sum_s A_s (cos(phi_s - phi_mean) - |sin(phi_s - phi_mean)|)
  less the noise threshold T, clipped at 0, is divided by the sum of the amplitudes A_s, and
  weighted by a sigmoid of the spread of the frequencies.
* T comes from the median amplitude of the smallest scale, as the mean plus k standard
  deviations of a Rayleigh distribution, summed over the scales. Kovesi takes the median over
  the whole grid. This code takes it over the pixels of the image only, not the extension.
* The phase congruency of each direction o gives the vector PC_o (cos theta_o, sin theta_o).
  The largest and smallest moments M and m of their covariance mark edges and corners.
* The feature type is atan2 of the summed even responses and the length of the summed odd
  vectors: pi / 2 on a bright line, 0 on a step, -pi / 2 on a dark line. Away from features it
  has no meaning, so the image shows it only where M is at least 0.05, which is our choice.

Kovesi divides the energy by the sum of the amplitudes as it is. This code adds the epsilon
1e-5 there too, so a flat image gives 0 and not 0 / 0.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import scipy.fft
from numpy.typing import NDArray

from pixelnexus_engine.planes import KB, KG, KR, Plane, to_uint8
from pixelnexus_engine.psf import crop, extend
from pixelnexus_engine.registry import Progress, Rgba, register

EPSILON = 1e-5
LOW_PASS_CUTOFF = 0.45
LOW_PASS_ORDER = 15
STRETCH_FLOOR = 1e-3
# Our choice: the feature type shows only where M reaches this, and mid gray elsewhere.
TYPE_FLOOR = 0.05


def luma(image: Rgba) -> Plane:
    rgb = image[..., :3].astype(np.float64)
    y: Plane = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return y


def wavelengths(params: dict[str, Any]) -> list[float]:
    return [params["minWavelength"] * params["mult"] ** s for s in range(params["scales"])]


def directions(norient: int) -> list[float]:
    return [o * math.pi / norient for o in range(norient)]


def frequency_grid(shape: tuple[int, int]) -> tuple[Plane, Plane]:
    """The radius f in cycles per pixel and the direction phi = atan2(f_x, f_y) of each FFT
    frequency, as in Kovesi's code. f_y counts down the rows."""
    fy = scipy.fft.fftfreq(shape[0])[:, None]
    fx = scipy.fft.fftfreq(shape[1])[None, :]
    radius: Plane = np.hypot(fx, fy)
    phi: Plane = np.arctan2(fx, fy) + np.zeros(shape)
    return radius, phi


def radial_filter(radius: Plane, wavelength: float, sigma_onf: float) -> Plane:
    """The log-Gabor function of the wavelength times Kovesi's low-pass."""
    f0 = 1.0 / wavelength
    safe = np.where(radius > 0, radius, 1.0)
    log_gabor = np.exp(-(np.log(safe / f0) ** 2) / (2 * math.log(sigma_onf) ** 2))
    log_gabor[radius == 0] = 0.0
    low_pass = 1.0 / (1.0 + (radius / LOW_PASS_CUTOFF) ** (2 * LOW_PASS_ORDER))
    out: Plane = log_gabor * low_pass
    return out


def angular_filter(phi: Plane, theta: float, norient: int) -> Plane:
    """The raised cosine around the direction theta, with the wavelength 4 pi / norient."""
    distance = np.abs(np.arctan2(np.sin(phi - theta), np.cos(phi - theta)))
    scaled = np.minimum(distance * norient / 2, math.pi)
    out: Plane = (np.cos(scaled) + 1) / 2
    return out


def noise_threshold(tau: float, params: dict[str, Any]) -> float:
    """Kovesi's threshold from the Rayleigh parameter tau of the smallest scale."""
    mult, nscale = float(params["mult"]), int(params["scales"])
    total = tau * (1 - (1 / mult) ** nscale) / (1 - 1 / mult)
    mean = total * math.sqrt(math.pi / 2)
    sigma = total * math.sqrt((4 - math.pi) / 2)
    return mean + float(params["k"]) * sigma


def phase_congruency_grid(
    grid: Plane, inside: tuple[slice, slice], params: dict[str, Any], progress: Progress
) -> dict[str, NDArray[np.float64]]:
    """The moments M and m, the feature type, and the threshold T of each direction, on the
    FFT grid. The noise statistics come from the pixels of grid[inside]."""
    shape = (grid.shape[0], grid.shape[1])
    spectrum = scipy.fft.fft2(grid)
    radius, phi = frequency_grid(shape)
    radials = [radial_filter(radius, w, params["sigmaOnf"]) for w in wavelengths(params)]
    norient, nscale = params["orientations"], params["scales"]
    cov_xx = np.zeros(shape)
    cov_yy = np.zeros(shape)
    cov_xy = np.zeros(shape)
    even_total = np.zeros(shape)
    odd_x = np.zeros(shape)
    odd_y = np.zeros(shape)
    thresholds = []
    for o, theta in enumerate(directions(norient)):
        angular = angular_filter(phi, theta, norient)
        responses = [scipy.fft.ifft2(spectrum * r * angular) for r in radials]
        amplitudes = [np.abs(r) for r in responses]
        sum_even = np.sum([r.real for r in responses], axis=0)
        sum_odd = np.sum([r.imag for r in responses], axis=0)
        sum_amplitude = np.sum(amplitudes, axis=0)
        max_amplitude = np.max(amplitudes, axis=0)
        # The Rayleigh parameter from the median amplitude of the smallest scale.
        tau = float(np.median(amplitudes[0][inside])) / math.sqrt(math.log(4))
        threshold = noise_threshold(tau, params)
        thresholds.append(threshold)
        even_total += sum_even
        odd_x += math.cos(theta) * sum_odd
        odd_y += math.sin(theta) * sum_odd
        length = np.hypot(sum_even, sum_odd) + EPSILON
        mean_even, mean_odd = sum_even / length, sum_odd / length
        energy = np.zeros(shape)
        for r in responses:
            e, d = r.real, r.imag
            energy += e * mean_even + d * mean_odd - np.abs(e * mean_odd - d * mean_even)
        energy = np.maximum(energy - threshold, 0.0)
        width = (sum_amplitude / (max_amplitude + EPSILON) - 1) / (nscale - 1)
        weight = 1.0 / (1.0 + np.exp((params["cutoff"] - width) * params["g"]))
        pc = weight * energy / (sum_amplitude + EPSILON)
        cov_xx += (pc * math.cos(theta)) ** 2
        cov_yy += (pc * math.sin(theta)) ** 2
        cov_xy += pc * math.cos(theta) * pc * math.sin(theta)
        progress((o + 1) / norient * 0.95)
    cov_xx /= norient / 2
    cov_yy /= norient / 2
    cov_xy *= 4 / norient
    spread = np.sqrt(cov_xy**2 + (cov_xx - cov_yy) ** 2) + EPSILON
    largest = (cov_xx + cov_yy + spread) / 2
    smallest = (cov_xx + cov_yy - spread) / 2
    kind = np.arctan2(even_total, np.hypot(odd_x, odd_y))
    return {"M": largest, "m": smallest, "type": kind, "T": np.asarray(thresholds)}


def phase_congruency(
    plane: Plane, params: dict[str, Any], progress: Progress
) -> dict[str, NDArray[np.float64]]:
    """phase_congruency_grid on the plane extended with the border mode, cropped back."""
    extended, (top, left) = extend(plane, params["border"])
    inside = (slice(top, top + plane.shape[0]), slice(left, left + plane.shape[1]))
    result = phase_congruency_grid(extended, inside, params, progress)
    for key in ("M", "m", "type"):
        result[key] = crop(result[key], plane.shape, (top, left))
    return result


def phase_congruency_representation(params: dict[str, Any]) -> dict[str, Any]:
    sizes = ", ".join(f"{w:.3g}" for w in wavelengths(params))
    norient = params["orientations"]
    output = params["output"]
    stages = [
        {
            "name": "Filter bank",
            "formula": "G(f, \\phi) = e^{-\\frac{(\\ln(f / f_0))^2}{2 (\\ln "
            f"{params['sigmaOnf']:g})^2}}\\, \\frac{{1 + \\cos(\\min({norient} \\lvert "
            "\\Delta\\phi \\rvert / 2,\\ \\pi))}}{2}",
            "note": f"Log-Gabor filters with the wavelengths {sizes} px, in {norient} "
            "directions, on one side of the spectrum. The real part of each response is the "
            "even filter, the imaginary part the odd one.",
        },
        {
            "name": "Energy",
            "formula": "E_o = \\sum_s A_s \\big(\\cos(\\phi_s - \\bar\\phi) - \\lvert "
            "\\sin(\\phi_s - \\bar\\phi) \\rvert\\big)",
            "note": "How well the phases phi_s of the scales agree with their weighted mean, "
            "weighted by their amplitudes A_s.",
        },
        {
            "name": "Noise",
            "formula": f"T = \\tau_{{\\text{{sum}}}} \\left(\\sqrt{{\\pi / 2}} + {params['k']:g}"
            " \\sqrt{(4 - \\pi) / 2}\\right),\\quad \\tau = \\frac{\\operatorname{median} "
            "A_1}{\\sqrt{\\ln 4}}",
            "note": "The noise threshold from the smallest scale, as a Rayleigh distribution, "
            "summed over the scales.",
        },
        {
            "name": "Phase congruency",
            "formula": "PC_o = W_o \\frac{\\max(E_o - T, 0)}{\\sum_s A_s + \\varepsilon},"
            f"\\quad W_o = \\frac{{1}}{{1 + e^{{{params['g']:g} ({params['cutoff']:g} - "
            "w_o)}}}",
            "note": "W_o lowers points where only one scale responds, with w_o the spread of "
            "the amplitudes from 0 to 1.",
        },
    ]
    if output == "type":
        stages.append(
            {
                "name": "Feature type",
                "formula": "\\operatorname{atan2}\\Big(\\sum_{o,s} e_{os},\\ \\big\\lVert "
                "\\sum_o (\\cos\\theta_o, \\sin\\theta_o) \\textstyle\\sum_s d_{os} "
                "\\big\\rVert\\Big)",
                "note": "With the even responses e and the odd responses d. pi / 2 on a bright "
                "line (white), 0 on a step (gray), -pi / 2 on a dark line (black). Shown only "
                f"where M is at least {TYPE_FLOOR:g}, and mid gray elsewhere.",
            }
        )
    else:
        moment = "M" if output == "edges" else "m"
        stages.append(
            {
                "name": "Moments",
                "formula": f"{moment} = \\tfrac12\\Big(c_{{xx}} + c_{{yy}} "
                f"{'+' if output == 'edges' else '-'} \\sqrt{{(2 c_{{xy}})^2 + (c_{{xx}} - "
                "c_{yy})^2}}\\Big)",
                "note": "From the covariance of the vectors PC_o (cos theta_o, sin theta_o). "
                "The largest moment M marks edges, the smallest m corners. "
                + (
                    "The result is stretched so its largest value is white."
                    if params["stretch"]
                    else "Values from 0 to 1 are shown from black to white."
                ),
            }
        )
    return {"kind": "stages", "stages": stages}


@register("phase-congruency", representation=phase_congruency_representation)
def phase_congruency_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    result = phase_congruency(luma(image), params, progress)
    output = params["output"]
    if output == "type":
        kind = np.where(result["M"] >= TYPE_FLOOR, result["type"], 0.0)
        values = (kind / math.pi + 0.5) * 255
    else:
        moment = np.clip(result["M" if output == "edges" else "m"], 0.0, 1.0)
        top = float(moment.max())
        # The epsilon of the moments leaves about 5e-6 on a flat image. That is not stretched.
        if params["stretch"] and top > STRETCH_FLOOR:
            moment = moment / top
        values = moment * 255
    out = image.copy()
    out[..., :3] = to_uint8(values)[..., None]
    progress(1.0)
    return out
