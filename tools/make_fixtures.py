"""Write reference test data for the browser engine.

Usage:
    uv run python tools/make_fixtures.py          # write everything in web/tests/fixtures/
    uv run python tools/make_fixtures.py --check  # fail if the JSON files are out of date

What it writes:
    synthetic.json   Small synthetic images shared by browser and engine tests.
    color.json       Color conversions computed with scikit-image.
    gaussian.json    Gaussian kernels computed with SciPy.
    geometry.json    Resize and rotation references, made by tools/fixtures_geometry.py.
    fft.json         FFTs of random signals of many lengths, computed with NumPy.
    filters.json     Reference results of the browser filters, made by tools/fixtures_filters.py
                     with SciPy, NumPy and scikit-image, and cross-checked with OpenCV.
    formats/         Small image files in every supported format, encoded by Pillow, and
                     manifest.json with the header facts and one decoded pixel for each file.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import PIL
from numpy.typing import NDArray
from PIL import Image as PILImage
from PIL import ImageCms, ImageOps
from scipy import ndimage
from skimage import color as skcolor

from fixtures_filters import filter_cases
from fixtures_geometry import geometry_cases

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web" / "tests" / "fixtures"
FORMATS_DIR = OUT_DIR / "formats"
SEED = 20261011

Image = NDArray[np.uint8]


# Synthetic inputs ------------------------------------------------------------------------------


def gradient_5x5() -> Image:
    """Horizontal ramp from 0 to 200 in steps of 50."""
    return np.tile(np.arange(0, 250, 50, dtype=np.uint8), (5, 1))


def checkerboard_8x8() -> Image:
    """2x2 pixel squares of 0 and 255."""
    yy, xx = np.mgrid[0:8, 0:8]
    return np.where(((yy // 2) + (xx // 2)) % 2 == 0, 255, 0).astype(np.uint8)


def object_16x16() -> Image:
    """A bright 6x6 square at rows 5 to 10 and columns 4 to 9 on a dark background."""
    image = np.full((16, 16), 20, dtype=np.uint8)
    image[5:11, 4:10] = 220
    return image


def salt_pepper_16x16() -> Image:
    """Flat gray image where 10 percent of pixels are set to 0 or 255."""
    rng = np.random.default_rng(SEED)
    image = np.full((16, 16), 128, dtype=np.uint8)
    noisy = rng.random((16, 16)) < 0.10
    salt = rng.random((16, 16)) < 0.5
    image[noisy & salt] = 255
    image[noisy & ~salt] = 0
    return image


SYNTHETIC: dict[str, Callable[[], Image]] = {
    "gradient-5x5": gradient_5x5,
    "checkerboard-8x8": checkerboard_8x8,
    "object-16x16": object_16x16,
    "salt-pepper-16x16": salt_pepper_16x16,
}


def encode(image: Image) -> dict[str, Any]:
    height, width = image.shape[:2]
    channels = 1 if image.ndim == 2 else image.shape[2]
    return {
        "width": int(width),
        "height": int(height),
        "channels": int(channels),
        "dtype": "uint8",
        "data": image.reshape(-1).tolist(),
    }


# Color conversions -----------------------------------------------------------------------------


def color_cases() -> dict[str, Any]:
    rng = np.random.default_rng(SEED)
    fixed = [
        [0, 0, 0],
        [255, 255, 255],
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [128, 128, 128],
        [10, 10, 10],
        [255, 255, 0],
        [0, 255, 255],
        [255, 0, 255],
        [200, 120, 40],
    ]
    rgb = np.array(fixed + rng.integers(0, 256, size=(53, 3)).tolist(), dtype=np.uint8)
    as_image = rgb.reshape(1, -1, 3)
    hsv = skcolor.rgb2hsv(as_image).reshape(-1, 3)
    lab = skcolor.rgb2lab(as_image, illuminant="D65", observer="2").reshape(-1, 3)
    return {
        "generator": "tools/make_fixtures.py",
        "source": "skimage.color.rgb2hsv and skimage.color.rgb2lab (D65, 2 degree observer)",
        "tolerance": {"hue": 1e-6, "other": 1e-6, "lab": 1e-4},
        "cases": [
            {
                "rgb": [int(v) for v in rgb[i]],
                "hsv": [float(hsv[i, 0] * 360), float(hsv[i, 1]), float(hsv[i, 2])],
                "lab": [float(v) for v in lab[i]],
            }
            for i in range(len(rgb))
        ],
    }


# Gaussian kernels ------------------------------------------------------------------------------


def gaussian_cases() -> dict[str, Any]:
    cases = []
    for sigma, truncate in [(0.5, 3.0), (1.0, 3.0), (1.6, 2.0), (2.5, 4.0), (0.8, 4.0)]:
        radius = int(truncate * sigma + 0.5)
        size = 4 * radius + 3
        delta = np.zeros(size)
        delta[size // 2] = 1.0
        response = ndimage.gaussian_filter1d(delta, sigma, truncate=truncate, mode="constant")
        kernel = response[size // 2 - radius : size // 2 + radius + 1]
        cases.append(
            {"sigma": sigma, "truncate": truncate, "radius": radius, "kernel": kernel.tolist()}
        )
    return {
        "generator": "tools/make_fixtures.py",
        "source": "scipy.ndimage.gaussian_filter1d applied to a unit impulse",
        "tolerance": 1e-12,
        "cases": cases,
    }


# Fast Fourier transforms -----------------------------------------------------------------------

# Powers of 2, products of 2, 3 and 5, and primes and other lengths that need Bluestein's method.
FFT_LENGTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 20, 25, 27, 30, 31, 45, 49]
FFT_LENGTHS += [60, 64, 97, 100, 120, 125, 128, 243, 250, 257, 360]
FFT_GRIDS = [(4, 8), (6, 10), (7, 9), (5, 13)]


def fft_cases() -> dict[str, Any]:
    rng = np.random.default_rng(SEED)

    def signal(shape: tuple[int, ...]) -> NDArray[np.complex128]:
        return rng.uniform(-1, 1, shape) + 1j * rng.uniform(-1, 1, shape)

    def pack(z: NDArray[np.complex128]) -> dict[str, list[float]]:
        return {"re": z.real.ravel().tolist(), "im": z.imag.ravel().tolist()}

    cases = []
    for n in FFT_LENGTHS:
        x = signal((n,))
        cases.append(
            {
                "n": n,
                "input": pack(x),
                "forward": pack(np.fft.fft(x)),
                # The browser inverse leaves out the 1/n factor.
                "inverse": pack(np.fft.ifft(x) * n),
            }
        )
    grids = []
    for rows, cols in FFT_GRIDS:
        x = signal((rows, cols))
        grids.append(
            {"rows": rows, "cols": cols, "input": pack(x), "forward": pack(np.fft.fft2(x))}
        )
    return {
        "generator": "tools/make_fixtures.py",
        "source": "numpy.fft.fft, numpy.fft.ifft and numpy.fft.fft2 of seeded random signals",
        "tolerance": 1e-9,
        "cases": cases,
        "grids": grids,
    }


# Image files in every supported format ---------------------------------------------------------

# Odd, non-square size, so swapped width and height show up in tests.
FILE_WIDTH = 37
FILE_HEIGHT = 23
PROBE = (5, 3)


def _rgb_pattern() -> PILImage.Image:
    yy, xx = np.mgrid[0:FILE_HEIGHT, 0:FILE_WIDTH]
    rgb = np.stack(
        [xx * 255 // (FILE_WIDTH - 1), yy * 255 // (FILE_HEIGHT - 1), (xx + yy) * 4 % 256],
        axis=-1,
    ).astype(np.uint8)
    return PILImage.fromarray(rgb)


def _rgba_pattern() -> PILImage.Image:
    image = _rgb_pattern().convert("RGBA")
    alpha = np.tile(np.linspace(0, 255, FILE_WIDTH).astype(np.uint8), (FILE_HEIGHT, 1))
    image.putalpha(PILImage.fromarray(alpha))
    return image


def _save(image: PILImage.Image, fmt: str, **options: Any) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, fmt, **options)
    return buffer.getvalue()


def _probe(data: bytes) -> list[int]:
    """RGBA at PROBE after decoding with Pillow and applying EXIF orientation."""
    with PILImage.open(io.BytesIO(data)) as opened:
        oriented = ImageOps.exif_transpose(opened)
        if oriented.mode.startswith("I;16"):
            # Pillow clips 16-bit values when converting. Browsers scale them down instead.
            value = round(int(oriented.getpixel(PROBE)) / 257)  # type: ignore[arg-type]
            return [value, value, value, 255]
        rgba = oriented.convert("RGBA")
        return [int(v) for v in rgba.getpixel(PROBE)]  # type: ignore[union-attr]


def format_files() -> list[tuple[str, bytes, dict[str, Any]]]:
    """Return (file name, bytes, expected header facts) for each test file."""
    rgb = _rgb_pattern()
    rgba = _rgba_pattern()
    gray = rgb.convert("L")
    gray16 = PILImage.fromarray((np.asarray(gray, dtype=np.uint16) * 257).astype(np.uint16))
    palette = rgb.quantize(colors=16)
    palette.info["transparency"] = 0
    srgb_profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    exif = PILImage.Exif()
    exif[0x0112] = 6
    frames = [rgb, ImageOps.invert(rgb)]
    size = {"width": FILE_WIDTH, "height": FILE_HEIGHT}

    files: list[tuple[str, bytes, dict[str, Any]]] = [
        ("png-rgb8.png", _save(rgb, "PNG"), {"format": "png", "bitDepth": 8, "channels": 3}),
        (
            "png-rgba8.png",
            _save(rgba, "PNG"),
            {"format": "png", "bitDepth": 8, "channels": 4, "hasAlpha": True},
        ),
        ("png-gray16.png", _save(gray16, "PNG"), {"format": "png", "bitDepth": 16, "channels": 1}),
        (
            "png-palette-trns.png",
            _save(palette, "PNG", transparency=0),
            {"format": "png", "bitDepth": 4, "colorModel": "palette", "hasAlpha": True},
        ),
        (
            "png-icc.png",
            _save(rgb, "PNG", icc_profile=srgb_profile),
            {"format": "png", "hasColorProfile": True},
        ),
        (
            "jpeg-rgb.jpg",
            _save(rgb, "JPEG", quality=92),
            {"format": "jpeg", "bitDepth": 8, "channels": 3, "lossy": True},
        ),
        (
            "jpeg-gray.jpg",
            _save(gray, "JPEG", quality=92),
            {"format": "jpeg", "channels": 1, "colorModel": "gray", "lossy": True},
        ),
        (
            "jpeg-exif-orient6.jpg",
            _save(rgb, "JPEG", quality=92, exif=exif.tobytes()),
            {"format": "jpeg", "orientation": 6, "lossy": True},
        ),
        (
            "jpeg-cmyk.jpg",
            _save(rgb.convert("CMYK"), "JPEG", quality=92),
            {"format": "jpeg", "channels": 4, "colorModel": "cmyk", "lossy": True},
        ),
        (
            "webp-lossy.webp",
            _save(rgb, "WEBP", quality=90),
            {"format": "webp", "hasAlpha": False, "lossy": True},
        ),
        (
            "webp-lossless-alpha.webp",
            _save(rgba, "WEBP", lossless=True),
            {"format": "webp", "hasAlpha": True},
        ),
        (
            "webp-anim.webp",
            _save(frames[0], "WEBP", save_all=True, append_images=frames[1:], lossless=True),
            {"format": "webp", "frames": 2},
        ),
        (
            "gif-anim.gif",
            _save(
                frames[0].quantize(colors=32),
                "GIF",
                save_all=True,
                append_images=[f.quantize(colors=32) for f in frames[1:]],
                transparency=0,
            ),
            {"format": "gif", "frames": 2, "hasAlpha": True, "colorModel": "palette"},
        ),
        ("bmp-24.bmp", _save(rgb, "BMP"), {"format": "bmp", "bitDepth": 8, "channels": 3}),
        (
            "bmp-8-palette.bmp",
            _save(rgb.quantize(colors=200), "BMP"),
            {"format": "bmp", "colorModel": "palette"},
        ),
        ("tiff-rgb8.tif", _save(rgb, "TIFF"), {"format": "tiff", "bitDepth": 8, "channels": 3}),
        (
            "tiff-gray16.tif",
            _save(gray16, "TIFF"),
            {"format": "tiff", "bitDepth": 16, "channels": 1},
        ),
        (
            "tiff-two-pages.tif",
            _save(frames[0], "TIFF", save_all=True, append_images=frames[1:]),
            {"format": "tiff", "frames": 2},
        ),
        (
            "avif-rgb.avif",
            _save(rgb, "AVIF", quality=90),
            {"format": "avif", "hasAlpha": False, "lossy": True},
        ),
        (
            "avif-alpha.avif",
            _save(rgba, "AVIF", quality=90),
            {"format": "avif", "hasAlpha": True, "lossy": True},
        ),
    ]
    result = []
    for name, data, expected in files:
        oriented = expected.get("orientation") in (5, 6, 7, 8)
        dims = (
            {"width": FILE_HEIGHT, "height": FILE_WIDTH, "fileWidth": FILE_WIDTH}
            if oriented
            else size
        )
        result.append(
            (name, data, {**size, **expected, "decoded": {**dims, "probe": _probe(data)}})
        )
    return result


def build() -> dict[str, str]:
    """Return file name to JSON text for every JSON fixture file."""
    synthetic = {
        "generator": "tools/make_fixtures.py",
        "description": "Small synthetic inputs shared by browser and engine tests.",
        "images": {name: encode(make()) for name, make in SYNTHETIC.items()},
    }
    manifest = {
        "generator": "tools/make_fixtures.py",
        "description": "Expected header facts for files encoded by Pillow.",
        "pillow": PIL.__version__,
        "probe": list(PROBE),
        "files": {name: facts for name, _data, facts in format_files()},
    }
    return {
        "synthetic.json": json.dumps(synthetic, indent=1) + "\n",
        "color.json": json.dumps(color_cases(), indent=1) + "\n",
        "gaussian.json": json.dumps(gaussian_cases(), indent=1) + "\n",
        "formats/manifest.json": json.dumps(manifest, indent=1) + "\n",
        # One line, because the file holds thousands of numbers.
        "filters.json": json.dumps(filter_cases(), separators=(",", ":")) + "\n",
        "geometry.json": json.dumps(geometry_cases(), separators=(",", ":")) + "\n",
        "fft.json": json.dumps(fft_cases(), separators=(",", ":")) + "\n",
    }


def same_data(a: Any, b: Any) -> bool:
    """True when two parsed JSON values match. Floats may differ in their last bits.

    NumPy and SciPy give slightly different last digits on different platforms, for example
    Windows and Linux. The tolerance here is far below every tolerance the tests use.
    """
    if isinstance(a, float) or isinstance(b, float):
        if not isinstance(a, int | float) or not isinstance(b, int | float):
            return False
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12)
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same_data(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same_data(x, y) for x, y in zip(a, b, strict=True))
    return bool(a == b)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if files are out of date")
    parser.add_argument(
        "--formats",
        action="store_true",
        help="rewrite the image files in formats/ too. Pillow builds differ in their bytes, "
        "so they are written only when missing unless you ask.",
    )
    args = parser.parse_args(argv)

    stale = []
    written = []
    for name, text in build().items():
        path = OUT_DIR / name
        current = path.read_text(encoding="utf-8") if path.exists() else None
        # Last-bit float differences between platforms do not count as a change.
        if current is not None and same_data(json.loads(current), json.loads(text)):
            continue
        if args.check:
            stale.append(name)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        written.append(name)
    for name, data, _facts in format_files():
        path = FORMATS_DIR / name
        if path.exists() and not args.formats:
            continue
        if args.check:
            stale.append(f"formats/{name}")
            continue
        path.write_bytes(data)
        written.append(f"formats/{name}")
    if stale:
        print("Out of date: " + ", ".join(stale) + ". Run tools/make_fixtures.py.")
        return 1
    if args.check:
        print("Fixtures are up to date.")
    else:
        print(f"Wrote {len(written)} file(s) in {OUT_DIR}: " + (", ".join(written) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
