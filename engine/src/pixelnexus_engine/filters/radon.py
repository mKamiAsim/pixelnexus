"""Radon transform filters: sinogram, back projection, and ridgelet filtering.

scikit-image computes the Radon transform (radon) and the back projection (iradon), with the
ramp filter of Kak and Slaney and its windows. Each plane is first placed in the middle of a
square of zeros, since the Radon transform sees zero outside the image, and the result is cut
back to the plane. Angles are spread evenly over 180 degrees.

Ridgelet filtering applies a 1-D wavelet transform along each projection of the sinogram, as in
Candes and Donoho's ridgelet transform, thresholds it, and rebuilds the plane by filtered back
projection. The sampled Radon transform and its back projection are not exact inverses, so the
result is an approximation of a true ridgelet filter.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pywt
from numpy.typing import NDArray
from skimage.transform import iradon, radon, resize

from pixelnexus_engine.filters.wavelets import NORMAL_Q75, shrink
from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

Sinogram = NDArray[np.float64]


def projection_angles(count: int) -> NDArray[np.float64]:
    """count angles in degrees, evenly spaced from 0 up to 180, without 180."""
    return np.arange(count) * 180.0 / count


def centered_square(plane: Plane) -> tuple[Plane, tuple[int, int]]:
    """The plane in the middle of a square of zeros, and the row and column where it starts."""
    height, width = plane.shape
    side = max(height, width)
    top, left = (side - height) // 2, (side - width) // 2
    square = np.zeros((side, side))
    square[top : top + height, left : left + width] = plane
    return square, (top, left)


def sinogram(plane: Plane, count: int) -> tuple[Sinogram, tuple[int, int]]:
    """The Radon transform: one column per angle, one row per position along the detector."""
    square, offset = centered_square(plane)
    values: Sinogram = radon(square, projection_angles(count), circle=False)  # type: ignore[no-untyped-call]
    return values, offset


def back_project(
    values: Sinogram, plane_shape: tuple[int, ...], offset: tuple[int, int], window: str | None
) -> Plane:
    """Filtered back projection with the ramp filter and a window, or plain back projection
    when the window is None. The result is cut back to the size of the plane."""
    count = values.shape[1]
    side = max(plane_shape)
    square = iradon(  # type: ignore[no-untyped-call]
        values, projection_angles(count), output_size=side, filter_name=window, circle=False
    )
    top, left = offset
    result: Plane = square[top : top + plane_shape[0], left : left + plane_shape[1]]
    return result


def stretch(values: Plane) -> Plane:
    """Map the smallest value to 0 and the largest to 255."""
    low, high = float(values.min()), float(values.max())
    if high - low < 1e-12:
        return np.zeros_like(values)
    stretched: Plane = (values - low) * (255.0 / (high - low))
    return stretched


def radon_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    values, offset = sinogram(plane, params["angles"])
    output = params["output"]
    if output == "sinogram":
        # Angle from left to right, position along the detector from top to bottom.
        shown = resize(values, plane.shape, order=1, mode="edge", anti_aliasing=False)  # type: ignore[no-untyped-call]
        return stretch(shown)
    if output == "backprojection":
        return stretch(back_project(values, plane.shape, offset, None))
    return back_project(values, plane.shape, offset, params["window"])


def ridgelet_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    """Threshold the 1-D wavelet details of every projection, then back project."""
    values, offset = sinogram(plane, params["angles"])
    wavelet = pywt.Wavelet(params["wavelet"])
    levels = min(params["levels"], pywt.dwt_max_level(values.shape[0], wavelet.dec_len))
    if levels < 1:
        return back_project(values, plane.shape, offset, "ramp")
    coeffs = pywt.wavedec(values, wavelet, mode="symmetric", level=levels, axis=0)
    thresholds = params["factor"] * projection_noise(coeffs[-1])
    shrunk = [coeffs[0]] + [shrink(band, thresholds, params["mode"]) for band in coeffs[1:]]
    rebuilt = pywt.waverec(shrunk, wavelet, mode="symmetric", axis=0)[: values.shape[0]]
    return back_project(rebuilt, plane.shape, offset, "ramp")


def projection_noise(finest: Sinogram) -> NDArray[np.float64]:
    """The noise level of each projection: the median absolute value of its finest details
    divided by 0.6745. Zeros, outside the image, are left out."""
    sigmas = np.zeros(finest.shape[1])
    for column in range(finest.shape[1]):
        values = np.abs(finest[:, column])
        values = values[values != 0]
        sigmas[column] = float(np.median(values)) / NORMAL_Q75 if values.size else 0.0
    return sigmas


# Representations ----------------------------------------------------------------------------

RADON = "p_\\theta(t) = \\sum_{x \\cos\\theta - y \\sin\\theta\\, =\\, t} I(x, y)"
ANGLES = "\\theta_i = \\frac{{180^\\circ\\, i}}{{{count}}},\\quad i = 0 \\ldots {last}"
BACK = (
    "\\hat{{I}}(x, y) = \\frac{{\\pi}}{{2 \\cdot {count}}} \\sum_i "
    "{q}(x \\cos\\theta_i - y \\sin\\theta_i)"
)
RAMP = (
    "Q_i = h * p_{\\theta_i},\\quad h(0) = \\tfrac{1}{4},\\ "
    "h(k) = -\\frac{1}{\\pi^2 k^2}\\ \\text{for odd } k,\\ h(k) = 0\\ \\text{for even } k"
)


def radon_representation(params: dict[str, Any]) -> dict[str, Any]:
    count = params["angles"]
    stages = [
        {
            "name": "Radon transform",
            "formula": f"{RADON},\\quad {ANGLES.format(count=count, last=count - 1)}",
            "note": "scikit-image radon, with linear interpolation along each line. x grows "
            "to the right and y downward, from the middle of the square.",
        }
    ]
    output = params["output"]
    if output == "sinogram":
        stages.append(
            {
                "name": "Show the sinogram",
                "formula": "S(i, t) = p_{\\theta_i}(t)",
                "note": "Resized to the image, angle across and detector position down, and "
                "stretched to the full gray range.",
            }
        )
    elif output == "backprojection":
        stages.append(
            {
                "name": "Back projection",
                "formula": BACK.format(count=count, q="p_{\\theta_i}"),
                "note": "Without the ramp filter, so the result is blurred. Stretched to the "
                "full gray range.",
            }
        )
    else:
        window = params["window"]
        stages += [
            {
                "name": "Ramp filter",
                "formula": RAMP,
                "note": f"The ramp filter of Kak and Slaney, applied with the FFT, times the "
                f"{window} window."
                if window != "ramp"
                else "The ramp filter of Kak and Slaney, applied with the FFT.",
            },
            {"name": "Back projection", "formula": BACK.format(count=count, q="Q_i")},
        ]
    return {"kind": "stages", "stages": stages}


def ridgelet_representation(params: dict[str, Any]) -> dict[str, Any]:
    count = params["angles"]
    wavelet = pywt.Wavelet(params["wavelet"])
    factor = params["factor"]
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Radon transform",
                "formula": f"{RADON},\\quad {ANGLES.format(count=count, last=count - 1)}",
            },
            {
                "name": "1-D wavelet transform",
                "formula": f"c_i = \\operatorname{{DWT}}_{{1D}}(p_{{\\theta_i}}),\\quad "
                f"J = {params['levels']}",
                "note": f"Along each projection, with the {wavelet.name} wavelet. These are "
                "the ridgelet coefficients.",
            },
            {
                "name": "Threshold",
                "formula": f"T_i = {factor:g}\\, \\hat{{\\sigma}}_i,\\quad "
                "\\hat{\\sigma}_i = \\operatorname{median}(|d_{1,i}|) / 0.6745",
                "note": "One noise level per projection, from its finest details.",
            },
            {
                "name": "Shrink",
                "formula": "\\eta_{T_i}(c)",
                "note": "Soft or hard, as in wavelet thresholding.",
            },
            {
                "name": "Rebuild",
                "formula": "\\hat{I} = \\operatorname{FBP}\\big(\\operatorname{IDWT}_{1D}"
                "(\\eta_{T_i}(c_i))\\big)",
                "note": "Filtered back projection with the ramp filter. It inverts the sampled "
                "Radon transform only approximately.",
            },
        ],
    }


@register("radon-filter", representation=radon_representation)
def radon_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    derived = params["output"] != "fbp"
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: radon_plane(plane, params),
        progress,
        derived=derived,
    )


@register("ridgelet", representation=ridgelet_representation)
def ridgelet(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: ridgelet_plane(plane, params),
        progress,
    )
