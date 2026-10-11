"""Write reference test data for the browser engine.

Usage:
    uv run python tools/make_fixtures.py          # write web/tests/fixtures/*.json
    uv run python tools/make_fixtures.py --check  # fail if the files are out of date

The browser engine is checked against SciPy, OpenCV and scikit-image. This script writes the
small synthetic input images now. From Phase 3 it also writes one reference case per browser
filter: input name, parameters, expected output and the tolerance, plus the library call used.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web" / "tests" / "fixtures"
SEED = 20261011

Image = NDArray[np.uint8]


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


def build() -> dict[str, str]:
    """Return file name to JSON text for every fixture file."""
    synthetic = {
        "generator": "tools/make_fixtures.py",
        "description": "Small synthetic inputs shared by browser and engine tests.",
        "images": {name: encode(make()) for name, make in SYNTHETIC.items()},
    }
    return {"synthetic.json": json.dumps(synthetic, indent=1) + "\n"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if files are out of date")
    args = parser.parse_args(argv)

    stale = []
    for name, text in build().items():
        path = OUT_DIR / name
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    if stale:
        print("Out of date: " + ", ".join(stale) + ". Run tools/make_fixtures.py.")
        return 1
    print("Fixtures are up to date." if args.check else f"Fixtures written to {OUT_DIR}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
