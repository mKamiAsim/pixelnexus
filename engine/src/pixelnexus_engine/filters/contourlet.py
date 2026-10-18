"""Contourlet denoising after Do and Vetterli (IEEE Transactions on Image Processing, 2005).

1. Laplacian pyramid. c = (h * x) downsampled by 2 in rows and columns, p = g * (c upsampled by
   2), d = x - p. h and g are the biorthogonal 9-7 analysis and synthesis low-pass filters of
   Cohen, Daubechies and Feauveau, as PyWavelets' bior4.4 (the "9-7" pyramid filters of the
   paper). The rebuild x = d + p is exact for any filters.
2. Directional filter bank. Each band d goes through a tree of two-channel quincunx filter banks
   with fan filters. From the third level on, a shear in front of each bank turns the fans into
   narrower wedges, as in Do and Vetterli's construction. With l levels there are 2^l wedges.
3. Each two-channel bank is the ladder structure of Phoong, Kim, Vaidyanathan and Ansari (IEEE
   Transactions on Signal Processing, 1995), mapped to 2-D quincunx sampling as in their section
   V. With the two cosets a0 (even i + j) and a1 (odd i + j):
       a0 <- (a0 + B a1) / 2,    a1 <- a1 - B a0,
   where B is the separable filter beta(z0) beta(z1) in the coordinates of the quincunx lattice,
   multiplied by (-1)^n0 to turn the diamond into a fan. beta is the 12-tap linear-phase filter
   of their Example 3.2, v1 to v6 below. The toolbox of Do and Vetterli calls it "pkva". The
   inverse runs the two steps backward, so the bank rebuilds exactly for any beta.
4. Thresholding. Coefficient w of band j and wedge k is shrunk with T = k_T sigma s_jk, where
   sigma is the noise level of the image and s_jk the standard deviation in that subband of
   white noise of standard deviation 1.

The following choices are PixelNexus's own. Each subband stays on the grid of its band, zero off
its sampling lattice, with the lattice given by a generator matrix and an offset. The shear of
each bank is picked from the geometry of its wedge, from the shears [[1, k], [0, 1]] and
[[1, 0], [k, 1]]. The image is extended symmetrically to a multiple of 2^(J + l), and the
directional filter bank is periodic on that extension. s_jk is measured once on 512 x 512 white
noise with a fixed seed.
"""

from __future__ import annotations

import functools
from dataclasses import dataclass
from typing import Any

import numpy as np
import pywt
from numpy.typing import NDArray
from scipy import fft, ndimage

from pixelnexus_engine.filters.directional import noise_sigma
from pixelnexus_engine.filters.wavelets import SHRINK_FORMULAS, shrink
from pixelnexus_engine.planes import Plane, filter_by_scope
from pixelnexus_engine.registry import Progress, Rgba, register

Float = NDArray[np.float64]
Matrix = NDArray[np.int64]

# Phoong, Kim, Vaidyanathan and Ansari 1995, Example 3.2 (N = 6): the coefficients v1 to v6 of
# the Type 2 linear-phase function V(z), as printed in the paper.
PKVA = (0.630, -0.193, 0.0972, -0.0526, 0.0272, -0.0144)
# The biorthogonal 9-7 filters, from PyWavelets, without the zero padding.
WAVELET = pywt.Wavelet("bior4.4")
H97 = np.array(WAVELET.dec_lo[1:])
G97 = np.array(WAVELET.rec_lo[1:8])
MARGIN = 16
NOISE_SIZE = 512
NOISE_SEED = 2005
QUINCUNX = np.array([[1, 1], [1, -1]], dtype=np.int64)
IDENTITY = np.eye(2, dtype=np.int64)
SHEARS = [IDENTITY] + [
    np.array(m, dtype=np.int64)
    for k in (1, -1, 2, -2, 3, -3, 4, -4)
    for m in ([[1, k], [0, 1]], [[1, 0], [k, 1]])
]


def ladder_taps(fan: bool = True) -> dict[tuple[int, int], float]:
    """The taps of B, beta(z0) beta(z1) in quincunx coordinates, as offsets on the grid.

    beta has the taps v_k at the half-sample positions +-(k - 1/2). The quincunx coordinates
    (s, u) are the offset (s + u, s - u) on the grid, which always joins the two cosets.
    """
    taps: dict[tuple[int, int], float] = {}
    for a, va in enumerate(PKVA):
        for b, vb in enumerate(PKVA):
            for s in (a + 0.5, -a - 0.5):
                for u in (b + 0.5, -b - 0.5):
                    offset = (round(s + u), round(s - u))
                    sign = -1.0 if fan and offset[0] % 2 else 1.0
                    taps[offset] = taps.get(offset, 0.0) + sign * va * vb
    return taps


FAN_TAPS = ladder_taps()


# Laplacian pyramid ------------------------------------------------------------------------------


def _separable(x: Float, taps: Float) -> Float:
    out: Float = ndimage.correlate1d(x, taps, axis=0, mode="mirror")
    out = ndimage.correlate1d(out, taps, axis=1, mode="mirror")
    return out


def lp_dec(x: Float) -> tuple[Float, Float]:
    """One level of the Laplacian pyramid: the coarse image c and the band d = x - p."""
    coarse = _separable(x, H97)[::2, ::2]
    return coarse, x - lp_predict(coarse, x.shape)


def lp_predict(coarse: Float, shape: tuple[int, ...]) -> Float:
    up = np.zeros(shape)
    up[::2, ::2] = coarse
    return _separable(up, G97)


def lp_rec(coarse: Float, band: Float) -> Float:
    return band + lp_predict(coarse, band.shape)


# Directional filter bank ------------------------------------------------------------------------


@dataclass(frozen=True)
class Wedge:
    """Directions with |w1| <= |w0| and w1 / w0 in [lo, hi] (family h), or the same with w0 and
    w1 swapped (family v). w0 is the frequency along the rows, so family h holds edges closer to
    horizontal."""

    family: str
    lo: float
    hi: float

    def direction(self, slope: float) -> Float:
        return np.array([1.0, slope] if self.family == "h" else [slope, 1.0])

    def holds(self, line: Float) -> bool:
        across, along = (line[0], line[1]) if self.family == "h" else (line[1], line[0])
        if abs(across) < 1e-12:
            return False
        return bool(self.lo + 1e-9 < along / across < self.hi - 1e-9)

    def degrees(self) -> float:
        """The angle of the edges at the middle of the wedge, counterclockwise from horizontal on
        screen, from 0 to 180 degrees. Rows grow downward, so the frequency vector on screen is
        (w1, -w0), and the edges run 90 degrees away from it."""
        w = self.direction((self.lo + self.hi) / 2)
        return float((np.degrees(np.arctan2(-w[0], w[1])) + 90) % 180)


@dataclass(frozen=True)
class Lattice:
    """The points G m + t of the band grid, for integer m."""

    generator: Matrix
    offset: tuple[int, int]


@dataclass(frozen=True)
class Node:
    lattice: Lattice
    shear: Matrix
    even_first: bool


def _parallel(a: Float, b: Float) -> bool:
    return bool(abs(a[0] * b[1] - a[1] * b[0]) < 1e-9 * np.linalg.norm(a) * np.linalg.norm(b))


def choose_shear(generator: Matrix, wedge: Wedge) -> tuple[Matrix, bool]:
    """The shear A whose fan splits the wedge in the middle, and whether the even coset gets the
    lower half.

    The bank on lattice G A splits along the lines (G A)^-T (1, +-1). One of them must be the
    middle of the wedge, and the other must miss the inside of the wedge.
    """
    middle = wedge.direction((wedge.lo + wedge.hi) / 2)
    for shear in SHEARS:
        ga = generator @ shear
        inverse = np.linalg.inv(ga).T
        lines = [inverse @ np.array([1.0, 1.0]), inverse @ np.array([1.0, -1.0])]
        for split, other in ((0, 1), (1, 0)):
            if _parallel(lines[split], middle) and not wedge.holds(lines[other]):
                lower = ga.T @ wedge.direction((3 * wedge.lo + wedge.hi) / 4)
                return shear, bool(abs(lower[0]) > abs(lower[1]))
    raise ValueError("No shear splits this wedge.")


class Bank:
    """Masks and filter spectra of the two-channel banks for one band shape, computed once."""

    def __init__(self, shape: tuple[int, int]):
        self.shape = shape
        self.rows, self.cols = np.indices(shape)
        self.cache: dict[tuple[Any, ...], Any] = {}

    def cosets(self, ga: Matrix, offset: tuple[int, int]) -> tuple[NDArray[np.bool_], ...]:
        key = ("cosets", ga.tobytes(), offset)
        if key not in self.cache:
            det = round(float(np.linalg.det(ga)))
            adjugate = np.array([[ga[1, 1], -ga[0, 1]], [-ga[1, 0], ga[0, 0]]])
            d0, d1 = self.rows - offset[0], self.cols - offset[1]
            m0 = adjugate[0, 0] * d0 + adjugate[0, 1] * d1
            m1 = adjugate[1, 0] * d0 + adjugate[1, 1] * d1
            on = (m0 % det == 0) & (m1 % det == 0)
            even = on & ((m0 // det + m1 // det) % 2 == 0)
            self.cache[key] = (even, on & ~even)
        cosets: tuple[NDArray[np.bool_], ...] = self.cache[key]
        return cosets

    def spectrum(self, ga: Matrix) -> NDArray[np.complex128]:
        key = ("spectrum", ga.tobytes())
        if key not in self.cache:
            kernel = np.zeros(self.shape)
            for (a, b), value in FAN_TAPS.items():
                row, col = ga @ np.array([a, b])
                kernel[row % self.shape[0], col % self.shape[1]] += value
            self.cache[key] = fft.rfft2(kernel)
        spectrum: NDArray[np.complex128] = self.cache[key]
        return spectrum

    def filtered(self, x: Float, ga: Matrix) -> Float:
        out: Float = fft.irfft2(fft.rfft2(x) * self.spectrum(ga), s=self.shape)
        return out


def plan(levels: int) -> tuple[list[list[Node]], list[Wedge]]:
    """The banks of each level of the tree, left to right, and the wedges of the subbands."""
    tree: list[list[Node]] = []
    current = [(Lattice(IDENTITY, (0, 0)), Wedge("h", -1.0, 1.0))]
    for level in range(levels):
        row = []
        children = []
        for lattice, wedge in current:
            if level == 0:
                # The first fan bank: the even coset keeps |w1| <= |w0|, the odd one the rest.
                shear, even_first = IDENTITY, True
                halves = [Wedge("h", -1.0, 1.0), Wedge("v", -1.0, 1.0)]
            else:
                shear, even_first = choose_shear(lattice.generator, wedge)
                mid = (wedge.lo + wedge.hi) / 2
                halves = [Wedge(wedge.family, wedge.lo, mid), Wedge(wedge.family, mid, wedge.hi)]
            row.append(Node(lattice, shear, even_first))
            ga = lattice.generator @ shear
            child = ga @ QUINCUNX
            odd = np.array(lattice.offset) + ga @ np.array([1, 0])
            even_lattice = Lattice(child, lattice.offset)
            odd_lattice = Lattice(child, (int(odd[0]), int(odd[1])))
            pair = (even_lattice, odd_lattice) if even_first else (odd_lattice, even_lattice)
            children += [(pair[0], halves[0]), (pair[1], halves[1])]
        tree.append(row)
        current = children
    return tree, [wedge for _, wedge in current]


@functools.cache
def _plan(levels: int) -> tuple[list[list[Node]], list[Wedge]]:
    return plan(levels)


def wedges(levels: int) -> list[Wedge]:
    """The wedges of the subbands, in the order dfb_dec returns them."""
    return _plan(levels)[1]


def _bank_dec(bank: Bank, x: Float, node: Node) -> tuple[Float, Float]:
    ga = node.lattice.generator @ node.shear
    even, odd = bank.cosets(ga, node.lattice.offset)
    x = np.where(even, 0.5 * (x + bank.filtered(np.where(odd, x, 0.0), ga)), x)
    x = np.where(odd, x - bank.filtered(np.where(even, x, 0.0), ga), x)
    low, high = np.where(even, x, 0.0), np.where(odd, x, 0.0)
    return (low, high) if node.even_first else (high, low)


def _bank_rec(bank: Bank, first: Float, second: Float, node: Node) -> Float:
    ga = node.lattice.generator @ node.shear
    even, odd = bank.cosets(ga, node.lattice.offset)
    x = first + second
    x = np.where(odd, x + bank.filtered(np.where(even, x, 0.0), ga), x)
    out: Float = np.where(even, 2 * x - bank.filtered(np.where(odd, x, 0.0), ga), x)
    return out


def dfb_dec(x: Float, levels: int, bank: Bank | None = None) -> list[Float]:
    """The 2^levels directional subbands, each on the grid of x and zero off its lattice."""
    bank = bank or Bank((x.shape[0], x.shape[1]))
    bands = [x]
    for row in _plan(levels)[0]:
        bands = [
            part
            for band, node in zip(bands, row, strict=True)
            for part in _bank_dec(bank, band, node)
        ]
    return bands


def dfb_rec(bands: list[Float], levels: int, bank: Bank | None = None) -> Float:
    bank = bank or Bank((bands[0].shape[0], bands[0].shape[1]))
    for row in reversed(_plan(levels)[0]):
        bands = [_bank_rec(bank, bands[2 * i], bands[2 * i + 1], n) for i, n in enumerate(row)]
    return bands[0]


# Contourlet transform ---------------------------------------------------------------------------


def contourlet_dec(x: Float, levels: int, directions: int) -> tuple[Float, list[list[Float]]]:
    """The coarse image and, from fine to coarse, the directional subbands of each band.

    The size of x must be a multiple of 2^(levels + log2(directions)).
    """
    tree = int(np.log2(directions))
    out = []
    for _ in range(levels):
        x, band = lp_dec(x)
        out.append(dfb_dec(band, tree))
    return x, out


def contourlet_rec(coarse: Float, bands: list[list[Float]], directions: int) -> Float:
    tree = int(np.log2(directions))
    x = coarse
    for subbands in reversed(bands):
        x = lp_rec(x, dfb_rec(subbands, tree))
    return x


@functools.cache
def noise_scales(levels: int, directions: int) -> tuple[tuple[float, ...], ...]:
    """s_jk: the standard deviation in each subband of white noise of standard deviation 1."""
    noise = np.random.default_rng(NOISE_SEED).standard_normal((NOISE_SIZE, NOISE_SIZE))
    _, bands = contourlet_dec(noise, levels, directions)
    return tuple(
        tuple(float(np.sqrt(np.sum(b * b) * directions / b.size)) for b in subbands)
        for subbands in bands
    )


def extend(plane: Plane, multiple: int) -> tuple[Plane, tuple[int, int]]:
    """The plane extended symmetrically by at least MARGIN pixels to a multiple of `multiple`."""
    pads = []
    for size in plane.shape:
        total = -(-(size + 2 * MARGIN) // multiple) * multiple
        before = (total - size) // 2
        pads.append((before, total - size - before))
    return np.pad(plane, pads, mode="symmetric"), (pads[0][0], pads[1][0])


def contourlet_plane(plane: Plane, params: dict[str, Any]) -> Plane:
    levels, directions = params["levels"], int(params["directions"])
    sigma = noise_sigma(plane, params["sigma"])
    extended, (top, left) = extend(plane, 2 ** (levels + int(np.log2(directions))))
    coarse, bands = contourlet_dec(extended, levels, directions)
    scales = noise_scales(levels, directions)
    factor = params["factor"]
    shrunk = [
        [shrink(b, factor * sigma * s, params["mode"]) for b, s in zip(subbands, row, strict=True)]
        for subbands, row in zip(bands, scales, strict=True)
    ]
    out = contourlet_rec(coarse, shrunk, directions)
    return out[top : top + plane.shape[0], left : left + plane.shape[1]]


def _taps(values: Any) -> str:
    return ",\\ ".join(f"{v:g}" for v in values)


def contourlet_representation(params: dict[str, Any]) -> dict[str, Any]:
    levels, directions = params["levels"], int(params["directions"])
    tree = int(np.log2(directions))
    sigma = (
        f"\\sigma = {params['sigma']:g}"
        if params["sigma"]
        else "\\hat{\\sigma} = \\operatorname{median}(|d_1|)\\, /\\, 0.6745"
    )
    return {
        "kind": "stages",
        "stages": [
            {
                "name": "Laplacian pyramid",
                "formula": (
                    "c_{j+1} = (h * c_j)\\downarrow_2,\\quad "
                    "d_j = c_j - g * (c_{j+1}\\uparrow_2),\\quad "
                    f"j = 0, \\dots, {levels - 1}"
                ),
                "note": f"h has the 9 taps ({_taps(np.round(H97, 4))}) and g the 7 taps "
                f"({_taps(np.round(G97, 4))}), the 9-7 filters of PyWavelets' bior4.4.",
            },
            {
                "name": "Directional filter bank",
                "formula": (
                    "a_0 \\leftarrow \\tfrac{1}{2}(a_0 + B a_1),\\quad "
                    "a_1 \\leftarrow a_1 - B a_0,\\quad "
                    f"B = \\beta(z_0)\\beta(z_1),\\quad l = {tree}"
                ),
                "note": f"A tree of {tree} levels of quincunx banks gives {directions} wedges in "
                f"each band. beta has the taps v = ({_taps(PKVA)}), mirrored, from Phoong et "
                "al. 1995.",
            },
            {
                "name": "Threshold",
                "formula": f"T_{{jk}} = {params['factor']:g}\\, \\sigma\\, s_{{jk}},\\quad {sigma}",
                "note": "s_jk is the spread of unit white noise in subband k of band j. The coarse "
                "image is kept.",
            },
            {"name": "Shrink", "formula": SHRINK_FORMULAS[params["mode"]]},
            {
                "name": "Rebuild",
                "formula": "c_j = d_j + g * (c_{j+1}\\uparrow_2)",
                "note": "The banks run backward first. Without thresholding the rebuild is exact.",
            },
        ],
    }


@register("contourlet", representation=contourlet_representation)
def contourlet(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return filter_by_scope(
        image,
        params["channelScope"],
        lambda plane, _channel: contourlet_plane(plane, params),
        progress,
    )
