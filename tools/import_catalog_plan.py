"""Create catalog stubs from the tables in planning/CATALOG.md.

Usage:
    uv run python tools/import_catalog_plan.py           # write missing stubs only
    uv run python tools/import_catalog_plan.py --check   # list missing stubs, write nothing

Existing YAML files are never overwritten. Stubs carry planning facts only: id, name,
aliases, family, tier, engine, phase, status and the planning note. Formulas and other
technical content are written by hand when an entry is implemented.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from catalog_lib import CATALOG_DIR, ROOT

PLAN_FILE = ROOT / "planning" / "CATALOG.md"

SECTION_FAMILY = {
    1: "linear",
    2: "nonlinear",
    3: "adaptive",
    4: "morphology",
    5: "frequency",
    6: "multiscale",
    7: "edges",
    8: "features",
    9: "enhancement",
    10: "restoration",
    11: "segmentation",
    12: "learned",
    13: "artistic",
    14: "utility",
}

TIERS = {
    "Core": "core",
    "Advanced": "advanced",
    "Optional": "optional",
    "Planned": "planned",
    "Unsupported": "unsupported",
}
ENGINES = {"Browser": "browser", "Science": "science", "Model": "model", "none": "none"}

TOOL_GROUPS = {
    "marquee-rect": "marquee",
    "marquee-ellipse": "marquee",
    "lasso": "lasso",
    "lasso-polygon": "lasso",
    "lasso-magnetic": "lasso",
    "edge-assisted": "lasso",
    "brush-select": "brush",
    "eraser-select": "brush",
    "magic-wand": "color",
    "color-range": "color",
    "select-brightness": "color",
    "select-hsv": "color",
    "quick-selection": "auto",
    "subject-heuristic": "auto",
    "background-heuristic": "auto",
    "object-select-classical": "auto",
    "click-select-classical": "auto",
    "ai-click-select": "ai",
    "ai-subject": "ai",
    "ai-matting": "ai",
}

# Other names for the same algorithm, taken from the notes column of planning/CATALOG.md.
ALIASES: dict[str, list[str]] = {
    "box": ["Mean filter", "Average filter", "Per-channel box filter"],
    "gaussian": ["Gaussian blur", "Separable Gaussian", "Per-channel Gaussian"],
    "triangular": ["Tent filter"],
    "disk-average": ["Circular averaging filter", "Defocus blur"],
    "unsharp-mask": ["Unsharp masking"],
    "wiener-denoise": ["Wiener linear filter"],
    "matched-filter": ["Matched frequency filter"],
    "median": ["Per-channel median filter"],
    "rank-order": ["Percentile filter"],
    "bilateral": ["Vector bilateral filter"],
    "anisotropic-diffusion": ["Perona-Malik diffusion"],
    "tv-denoise": ["Rudin-Osher-Fatemi denoising", "ROF denoising"],
    "wiener-adaptive": ["Wiener filter"],
    "adaptive-local-noise": ["Adaptive mean filter"],
    "sigma": ["Lee sigma filter"],
    "srad": ["SRAD"],
    "mad-outlier": ["MAD thresholding"],
    "savgol": ["Regression-based filters", "Local polynomial regression"],
    "ransac-surface": ["RANSAC-based robust estimation"],
    "morph-gradient": ["Beucher gradient"],
    "tophat": ["White top-hat"],
    "blackhat": ["Bottom-hat"],
    "ideal-bandreject": ["Ideal band-stop"],
    "butterworth-bandreject": ["Butterworth band-stop"],
    "gaussian-bandreject": ["Gaussian band-stop", "Band-stop filter"],
    "notch-reject": ["Notch filter"],
    "wavelet-threshold": [
        "Wavelet shrinkage denoising",
        "Haar wavelet thresholding",
        "Daubechies wavelet filtering",
        "Symlet wavelet filtering",
        "Coiflet wavelet filtering",
        "Wavelet hard thresholding",
        "Wavelet soft thresholding",
        "VisuShrink",
        "BayesShrink",
        "SureShrink",
    ],
    "swt-denoise": ["Undecimated wavelet filtering"],
    "sobel": ["Sobel X", "Sobel Y"],
    "prewitt": ["Prewitt X", "Prewitt Y"],
    "scharr": ["Scharr X", "Scharr Y", "Scharr-based sharpening"],
    "gabor-bank": ["Gabor wavelet bank"],
    "line-detector": [
        "Horizontal line detector",
        "Vertical line detector",
        "Diagonal line detectors",
        "Prewitt line masks",
        "Sobel line masks",
        "Laplacian-based line detector",
        "Oriented line filters",
    ],
    "frangi": ["Ridge filters"],
    "blob-dog": ["DoG keypoint detection"],
    "sift": ["SIFT-inspired scale-space keypoints"],
    "orb": ["ORB-inspired binary features"],
    "surf-inspired": ["SURF-inspired speeded features"],
    "retinex-ssr": ["Retinex"],
    "msrcr": ["Retinex-based color enhancement"],
    "detail-enhance": ["Bilateral detail enhancement", "Guided detail enhancement"],
    "wiener-deconv": [
        "Wiener restoration",
        "Wiener frequency filter",
        "Motion deblurring",
        "Linear motion deblurring",
        "Defocus deblurring",
        "Defocus deconvolution",
    ],
    "richardson-lucy": ["Lucy-Richardson deconvolution", "Non-blind deconvolution"],
    "threshold-global": ["Manual threshold"],
    "grabcut": ["GrabCut-inspired interactive segmentation"],
    "mean-shift": ["Mean-shift segmentation"],
    "felzenszwalb": ["Felzenszwalb graph-based segmentation"],
    "active-contour": ["Snakes"],
    "dncnn": ["CNN denoiser", "DnCNN-based deblocking"],
    "swinir": ["Transformer-based denoising"],
    "restormer": ["Attention-based restoration"],
}


@dataclass(frozen=True)
class Row:
    section: int
    entry_id: str
    name: str
    notes: str
    tier: str
    engine: str
    phase: str


def parse_rows(text: str) -> list[Row]:
    rows: list[Row] = []
    section = 0
    heading = re.compile(r"^## (\d+)\. ")
    for line in text.splitlines():
        match = heading.match(line)
        if match:
            section = int(match.group(1))
            continue
        if not line.startswith("| "):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 6 or cells[3] not in TIERS:
            continue
        if "," in cells[0]:  # pointer rows such as "ai-click-select, ai-subject, ai-matting"
            continue
        rows.append(Row(section, cells[0], cells[1], cells[2], *cells[3:6]))
    return rows


def stub_for(row: Row) -> tuple[Path, dict[str, Any]]:
    tier = TIERS[row.tier]
    engine = ENGINES[row.engine]
    is_tool = row.section == 15 or (row.section == 12 and row.entry_id in TOOL_GROUPS)
    data: dict[str, Any] = {"id": row.entry_id, "name": row.name}
    aliases = ALIASES.get(row.entry_id)
    if aliases:
        data["aliases"] = aliases
    if is_tool:
        data["group"] = TOOL_GROUPS[row.entry_id]
        path = CATALOG_DIR / "tools" / f"{row.entry_id}.yaml"
    else:
        family = SECTION_FAMILY[row.section]
        data["family"] = family
        path = CATALOG_DIR / "filters" / family / f"{row.entry_id}.yaml"
    data["tier"] = tier
    data["engine"] = engine
    if row.phase:
        data["phase"] = row.phase
    data["status"] = "unsupported" if tier == "unsupported" else "planned"
    if row.notes:
        data["reason" if tier in ("planned", "unsupported") else "planNotes"] = row.notes
    return path, data


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="list missing stubs only")
    args = parser.parse_args(argv)

    rows = parse_rows(PLAN_FILE.read_text(encoding="utf-8"))
    missing = 0
    for row in rows:
        path, data = stub_for(row)
        if path.exists():
            continue
        missing += 1
        if args.check:
            print(f"missing: {path.relative_to(ROOT)}")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=100)
        path.write_text(text, encoding="utf-8")
    action = "missing" if args.check else "written"
    print(f"Rows in plan: {len(rows)}. Stubs {action}: {missing}.")
    return 1 if args.check and missing else 0


if __name__ == "__main__":
    sys.exit(main())
