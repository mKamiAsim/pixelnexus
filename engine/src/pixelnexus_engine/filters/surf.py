"""A SURF-inspired detector: the Fast-Hessian of Bay et al. (2008), in PixelNexus's own code.

SURF itself is patented and OpenCV leaves it out of its default builds, so this is our own
code after the paper. Only the detector and the orientation are built, not the descriptor.

* The input is the luma (BT.709) from 0 to 1, and its integral image.
* Box filters approximate the Gaussian second derivatives. A filter of size L (odd, L = 3 l)
  has lobes of l pixels. D_yy has three lobes of l rows and 2 l - 1 columns, with weights 1,
  -2 and 1, and D_xx is its transpose. D_xy has four lobes of l x l, one pixel away from the
  center row and column, with weight 1 at the top left and bottom right and -1 at the others.
  Each response is divided by L^2. Pixels outside the image count as 0.
* The response is det = D_xx D_yy - (0.9 D_xy)^2, with the weight 0.9 of the paper.
* Octave o (from 0) has the filter sizes 3 (2^(o + 1) + 1) + k 6 2^o for k = 0, 1, 2, 3: 9, 15,
  21, 27, then 15, 27, 39, 51, and so on. A filter of size L stands for sigma = 1.2 L / 9.
* Keypoints are maxima of det above the threshold over their 3 x 3 x 3 neighbors in position
  and size, in the two middle sizes of each octave. Of touching maxima with the same value,
  the first in raster order stays. Responses are computed at every pixel, and there is no
  subpixel refinement. Keypoints closer to the edge than half the largest filter
  of their octave are dropped.
* The orientation follows the paper: Haar wavelet responses of side about 4 s at the points
  of a grid of step s within a radius of 6 s, weighted by a Gaussian of 2 s, where s is sigma
  rounded. Our wavelets span 4 s + 1 pixels and leave out the center row or column, so a
  quarter turn of the image turns the responses exactly. A window of 60 degrees slides around
  the circle in steps of 5 degrees, and the longest sum of responses gives the angle. The steps
  of 5 degrees are our choice.
* The sign of the Laplacian D_xx + D_yy tells bright blobs (negative) from dark ones.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage

from pixelnexus_engine.planes import KB, KG, KR, Plane
from pixelnexus_engine.registry import Progress, Rgba, register

Integral = NDArray[np.float64]
Index = NDArray[np.int64]

DXY_WEIGHT = 0.9
WINDOW = math.pi / 3
WINDOW_STEP = math.radians(5)

COLUMNS = [
    {"key": "x", "label": "x", "unit": "px"},
    {"key": "y", "label": "y", "unit": "px"},
    {"key": "radius", "label": "Sigma", "unit": "px"},
    {"key": "size", "label": "Filter size", "unit": "px"},
    {"key": "angle", "label": "Angle", "unit": "deg"},
    {"key": "score", "label": "Score", "unit": ""},
    {"key": "laplacian", "label": "Laplacian sign", "unit": ""},
]


def luma01(image: Rgba) -> Plane:
    rgb = image[..., :3].astype(np.float64) / 255
    y: Plane = KR * rgb[..., 0] + KG * rgb[..., 1] + KB * rgb[..., 2]
    return y


def integral(plane: Plane) -> Integral:
    """S[i, j] is the sum of plane[:i, :j], so S has one more row and column."""
    out = np.zeros((plane.shape[0] + 1, plane.shape[1] + 1))
    out[1:, 1:] = plane.cumsum(axis=0).cumsum(axis=1)
    return out


def box(s: Integral, top: Any, left: Any, bottom: Any, right: Any) -> Any:
    """The sum of rows top..bottom - 1 and columns left..right - 1, clipped to the image."""
    height, width = s.shape[0] - 1, s.shape[1] - 1
    t = np.clip(top, 0, height)
    b = np.clip(bottom, 0, height)
    lf = np.clip(left, 0, width)
    r = np.clip(right, 0, width)
    return s[b, r] - s[t, r] - s[b, lf] + s[t, lf]


def hessian_boxes(s: Integral, size: int) -> tuple[Plane, Plane, Plane]:
    """D_xx, D_yy and D_xy of one filter size at every pixel, divided by size^2."""
    height, width = s.shape[0] - 1, s.shape[1] - 1
    lobe = size // 3
    half = (size - 1) // 2
    r, c = np.mgrid[0:height, 0:width]
    # D_yy: L rows by 2 l - 1 columns, minus 3 times the middle lobe.
    wide = box(s, r - half, c - lobe + 1, r + half + 1, c + lobe)
    middle = box(s, r - half + lobe, c - lobe + 1, r - half + 2 * lobe, c + lobe)
    dyy = wide - 3 * middle
    wide = box(s, r - lobe + 1, c - half, r + lobe, c + half + 1)
    middle = box(s, r - lobe + 1, c - half + lobe, r + lobe, c - half + 2 * lobe)
    dxx = wide - 3 * middle
    dxy = (
        box(s, r - lobe, c - lobe, r, c)
        + box(s, r + 1, c + 1, r + lobe + 1, c + lobe + 1)
        - box(s, r - lobe, c + 1, r, c + lobe + 1)
        - box(s, r + 1, c - lobe, r + lobe + 1, c)
    )
    area = float(size * size)
    return dxx / area, dyy / area, dxy / area


def octave_sizes(octave: int) -> list[int]:
    first = 3 * (2 ** (octave + 1) + 1)
    return [first + k * 6 * 2**octave for k in range(4)]


def sigma_of(size: int) -> float:
    return 1.2 * size / 9


def detect(gray: Plane, params: dict[str, Any]) -> list[tuple[int, int, int, float, float]]:
    """Keypoints as (row, column, filter size, det, laplacian sign)."""
    s = integral(gray)
    height, width = gray.shape
    found: list[tuple[int, int, int, float, float]] = []
    for octave in range(params["octaves"]):
        sizes = octave_sizes(octave)
        border = (sizes[-1] - 1) // 2 + 1
        if 2 * border >= min(height, width):
            break
        dets, traces = [], []
        for size in sizes:
            dxx, dyy, dxy = hessian_boxes(s, size)
            dets.append(dxx * dyy - (DXY_WEIGHT * dxy) ** 2)
            traces.append(dxx + dyy)
        stack = np.stack(dets)
        peaks = (stack == ndimage.maximum_filter(stack, size=3, mode="nearest")) & (
            stack > params["threshold"]
        )
        peaks[[0, -1]] = False
        peaks[:, :border] = False
        peaks[:, -border:] = False
        peaks[:, :, :border] = False
        peaks[:, :, -border:] = False
        # A blob centered between pixels gives equal maxima side by side. Keep the first of
        # each group of touching maxima.
        groups, count = ndimage.label(peaks, structure=np.ones((3, 3, 3)))
        firsts = ndimage.minimum(
            np.arange(peaks.size).reshape(peaks.shape), groups, range(1, count + 1)
        )
        for flat in np.atleast_1d(firsts).astype(np.int64):
            k, row, col = np.unravel_index(int(flat), peaks.shape)
            sign = 1.0 if traces[k][row, col] > 0 else -1.0
            found.append((int(row), int(col), sizes[k], float(stack[k, row, col]), sign))
    return found


def orientation(s: Integral, row: int, col: int, sigma: float) -> float:
    """The angle in degrees, counterclockwise from the x axis, as in SURF."""
    step = max(1, round(sigma))
    half = step * 2
    i, j = np.mgrid[-6:7, -6:7]
    inside = i * i + j * j <= 36
    i, j = i[inside], j[inside]
    px = col + i * step
    py = row + j * step
    # Each half leaves out the center row or column, so a quarter turn of the image turns the
    # responses exactly.
    right = box(s, py - half, px + 1, py + half + 1, px + half + 1)
    left = box(s, py - half, px - half, py + half + 1, px)
    bottom = box(s, py + 1, px - half, py + half + 1, px + half + 1)
    top = box(s, py - half, px - half, py, px + half + 1)
    weight = np.exp(-(i * i + j * j) / 8.0)
    dx = (right - left) * weight
    dy = (bottom - top) * weight
    angles = np.arctan2(dy, dx)
    best = (0.0, 0.0, -1.0)
    for start in np.arange(0, 2 * math.pi, WINDOW_STEP):
        delta = (angles - start) % (2 * math.pi)
        chosen = delta < WINDOW
        sx, sy = float(dx[chosen].sum()), float(dy[chosen].sum())
        length = sx * sx + sy * sy
        if length > best[2]:
            best = (sx, sy, length)
    # dy counts downward in the image. Counterclockwise angles count upward.
    return math.degrees(math.atan2(-best[1], best[0])) % 360


def surf_table(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    gray = luma01(image)
    found = detect(gray, params)
    progress(0.7)
    s = integral(gray)
    rows = []
    for row, col, size, det, sign in found:
        sigma = sigma_of(size)
        angle = orientation(s, row, col, sigma) if params["orientation"] else 0.0
        rows.append([col, row, round(sigma, 4), size, round(angle, 2), round(det, 8), sign])
    rows.sort(key=lambda r: -r[5])
    progress(1.0)
    noun = "keypoint" if len(rows) == 1 else "keypoints"
    return {"kind": "features", "columns": COLUMNS, "rows": rows, "summary": f"{len(rows)} {noun}"}


def surf_representation(params: dict[str, Any]) -> dict[str, Any]:
    sizes = "; ".join(", ".join(str(v) for v in octave_sizes(o)) for o in range(params["octaves"]))
    stages = [
        {
            "name": "Integral image",
            "formula": "S(x, y) = \\sum_{x' < x,\\ y' < y} I(x', y')",
            "note": "Any box sum then takes four lookups, whatever its size.",
        },
        {
            "name": "Box Hessian",
            "formula": "\\det H \\approx D_{xx} D_{yy} - (0.9\\, D_{xy})^2",
            "note": f"Box filters of the sizes {sizes} px, each response divided by L^2. A "
            "filter of size L stands for sigma = 1.2 L / 9.",
        },
        {
            "name": "Maxima",
            "formula": f"\\det H \\ge {params['threshold']:g},\\quad \\det H = "
            "\\max_{3 \\times 3 \\times 3}",
            "note": "Over the neighbors in position and filter size, in the two middle sizes "
            "of each octave. No subpixel refinement.",
        },
    ]
    if params["orientation"]:
        stages.append(
            {
                "name": "Orientation",
                "formula": "\\theta = \\arg\\max_{\\text{window of } \\pi/3} \\Big\\lVert "
                "\\sum (d_x, d_y) \\Big\\rVert",
                "note": "Haar wavelet responses of side 4 s within 6 s, weighted by a "
                "Gaussian of 2 s. The window moves in steps of 5 degrees.",
            }
        )
    return {"kind": "stages", "stages": stages}


@register("surf-inspired", representation=surf_representation)
def surf_inspired(image: Rgba, params: dict[str, Any], progress: Progress) -> dict[str, Any]:
    return surf_table(image, params, progress)
