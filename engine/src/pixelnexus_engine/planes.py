"""Channel scopes and 8-bit output for engine filters, with the rules of the browser framework.

The rules match web/src/core/filters/run.ts and planes.ts, so a filter treats color the same
way in both engines:

* "rgb" and "per-channel" filter red, green and blue, each on its own.
* "luminance" filters Y of full-range Y'CbCr with the BT.709 weights, on encoded values, and
  keeps Cb and Cr. "chroma" filters Cb and Cr and keeps Y.
* Alpha is kept.
* Results are rounded half to even and clipped to 0 to 255, as a Uint8ClampedArray does.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.registry import Progress, Rgba

Plane = NDArray[np.float64]
# A function of one plane and its channel number: 0 red, 1 green, 2 blue, or 0 for Y.
PlaneFunction = Callable[[Plane, int], Plane]

KR = 0.2126
KG = 0.7152
KB = 0.0722
CB_SCALE = 2 * (1 - KB)
CR_SCALE = 2 * (1 - KR)


def rgb_to_ycc(r: Plane, g: Plane, b: Plane) -> tuple[Plane, Plane, Plane]:
    """Full-range Y'CbCr without offsets: Cb = (B - Y) / CB_SCALE, Cr = (R - Y) / CR_SCALE."""
    y = KR * r + KG * g + KB * b
    return y, (b - y) / CB_SCALE, (r - y) / CR_SCALE


def ycc_to_rgb(y: Plane, cb: Plane, cr: Plane) -> tuple[Plane, Plane, Plane]:
    """The exact inverse of rgb_to_ycc."""
    r = y + CR_SCALE * cr
    b = y + CB_SCALE * cb
    return r, (y - KR * r - KB * b) / KG, b


def to_uint8(plane: Plane) -> NDArray[np.uint8]:
    return np.clip(np.rint(plane), 0, 255).astype(np.uint8)


def filter_by_scope(image: Rgba, scope: str, function: PlaneFunction, progress: Progress) -> Rgba:
    """Run a plane function on the planes the channel scope names, and rebuild the image."""
    r, g, b = (image[..., channel].astype(np.float64) for channel in range(3))
    if scope in ("rgb", "per-channel"):
        planes = [r, g, b]
        out = []
        for channel, plane in enumerate(planes):
            out.append(function(plane, channel))
            progress((channel + 1) / 3)
        color = tuple(out)
    elif scope == "luminance":
        y, cb, cr = rgb_to_ycc(r, g, b)
        y = function(y, 0)
        progress(1.0)
        color = ycc_to_rgb(y, cb, cr)
    elif scope == "chroma":
        y, cb, cr = rgb_to_ycc(r, g, b)
        cb = function(cb, 1)
        progress(0.5)
        cr = function(cr, 2)
        progress(1.0)
        color = ycc_to_rgb(y, cb, cr)
    else:
        raise ValueError(f'There is no channel scope "{scope}".')
    result = image.copy()
    for channel in range(3):
        result[..., channel] = to_uint8(color[channel])
    return result
