"""Draw the filter figures for the docs from data made by the real browser filter code.

Usage:
    pnpm --filter @pixelnexus/web gen:filter-docs     # first: run the TypeScript filters
    uv run python tools/figures/make_figures.py       # then: draw the figures

Input:  tools/figures/data/<id>.json (not committed)
Output: docs/assets/figures/<id>-light.svg and <id>-dark.svg (committed)

Rules from planning/WRITING_STYLE.md, section 6:
* Fixed size. Figures are 480 px wide with 16 px text, so text stays near 12 px on a phone.
* Okabe-Ito colors for lines. Images are shown in gray, or in color when they are color images.
* One message per figure. A light and a dark version.
* The SVG files are deterministic: no dates, fixed ids.
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("svg")
import matplotlib.pyplot as plt
import numpy as np
from cycler import cycler

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "tools" / "figures" / "data"
OUT = ROOT / "docs" / "assets" / "figures"

WIDTH_PX = 480
DPI = 96
FONT_PX = 16

# Okabe and Ito, Color Universal Design. Safe for color-blind readers.
OKABE_ITO = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442"]

THEMES = {
    "light": {"text": "#1f2328", "muted": "#59636e", "grid": "#d1d9e0"},
    "dark": {"text": "#e6edf3", "muted": "#9198a1", "grid": "#3d444d"},
}


def style(theme: str) -> None:
    colors = THEMES[theme]
    plt.rcParams.update(
        {
            "svg.hashsalt": "pixelnexus",
            "svg.fonttype": "none",
            "font.family": "sans-serif",
            "font.sans-serif": ["Inter", "DejaVu Sans", "Arial"],
            "font.size": FONT_PX * 72 / DPI,
            "text.color": colors["text"],
            "axes.labelcolor": colors["text"],
            "axes.edgecolor": colors["muted"],
            "xtick.color": colors["muted"],
            "ytick.color": colors["muted"],
            "xtick.labelcolor": colors["text"],
            "ytick.labelcolor": colors["text"],
            "axes.titlesize": FONT_PX * 72 / DPI,
            "axes.labelsize": FONT_PX * 72 / DPI,
            "xtick.labelsize": FONT_PX * 72 / DPI,
            "ytick.labelsize": FONT_PX * 72 / DPI,
            "legend.fontsize": FONT_PX * 72 / DPI,
            "legend.frameon": False,
            "axes.prop_cycle": cycler(color=OKABE_ITO),
            "axes.grid": True,
            "grid.color": colors["grid"],
            "grid.linewidth": 0.6,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "figure.facecolor": "none",
            "axes.facecolor": "none",
            "savefig.facecolor": "none",
        }
    )


def image_array(image: dict[str, Any]) -> Any:
    data = np.asarray(image["data"], dtype=np.uint8)
    if image["color"]:
        return data.reshape(image["height"], image["width"], 3)
    return data.reshape(image["height"], image["width"])


def panels_figure(spec: dict[str, Any]) -> Any:
    panels = spec["panels"]
    columns = {4: 2, 6: 3}.get(len(panels), len(panels))
    rows = (len(panels) + columns - 1) // columns
    width_in = WIDTH_PX / DPI
    first = image_array(panels[0]["image"])
    aspect = first.shape[0] / first.shape[1]
    height_in = rows * (width_in / columns * aspect + 0.42)
    fig, axes = plt.subplots(rows, columns, figsize=(width_in, height_in), dpi=DPI, squeeze=False)
    for ax, panel in zip(axes.flat, panels, strict=False):
        array = image_array(panel["image"])
        if panel.get("stretch"):
            # A blurred point is dim. Stretch it so its shape is visible.
            array = (array.astype(float) * (255.0 / max(1, int(array.max())))).astype(np.uint8)
        # "none" embeds the pixels as they are. The browser scales them, without new moire.
        ax.imshow(array, cmap="gray", vmin=0, vmax=255, interpolation="none")
        ax.set_title(panel["title"], pad=4)
        ax.set_axis_off()
    for ax in list(axes.flat)[len(panels) :]:
        ax.set_axis_off()
    fig.tight_layout(pad=0.3, w_pad=0.4, h_pad=0.6)
    return fig


def profile_figure(spec: dict[str, Any]) -> Any:
    profile = spec["profile"]
    lines = profile["lines"]
    width_in = WIDTH_PX / DPI
    styles = ["-", "--", "-.", ":"]
    # Pixel values are drawn as steps. Continuous curves, such as kernels, ask for "smooth".
    smooth = profile.get("square") or profile.get("smooth")
    drawstyle = "default" if smooth else "steps-mid"
    if profile.get("split"):
        # One panel per line, when the lines have very different value ranges.
        fig, axes = plt.subplots(
            len(lines), 1, figsize=(width_in, 1.9 * len(lines) + 0.5), dpi=DPI, sharex=True
        )
        for index, (ax, line) in enumerate(zip(axes, lines, strict=True)):
            ax.plot(
                profile["x"],
                line["values"],
                color=OKABE_ITO[index],
                linewidth=2,
                drawstyle=drawstyle,
            )
            ax.set_title(line["label"], loc="left", pad=4)
        axes[-1].set_xlabel(profile["xlabel"])
        fig.tight_layout(pad=0.3, h_pad=0.8)
        return fig
    height_in = width_in * (0.9 if profile.get("square") else 0.62) + 0.45
    fig, ax = plt.subplots(figsize=(width_in, height_in), dpi=DPI)
    for index, line in enumerate(lines):
        ax.plot(
            profile["x"],
            line["values"],
            label=line["label"],
            linestyle=styles[index % len(styles)],
            linewidth=2,
            drawstyle=drawstyle,
        )
    ax.set_xlabel(profile["xlabel"])
    ax.set_ylabel(profile["ylabel"])
    if profile.get("smooth"):
        ax.axhline(0, color=plt.rcParams["grid.color"], linewidth=1, zorder=0)
    if profile.get("square"):
        ax.set_xlim(0, 255)
        ax.set_ylim(0, 255)
        ax.set_xticks([0, 64, 128, 192, 255])
        ax.set_yticks([0, 64, 128, 192, 255])
    # The legend sits below the plot, so it never covers a line. Long labels get one column,
    # so they stay inside the figure.
    ncol = 1 if max(len(line["label"]) for line in lines) > 20 else min(len(lines), 2)
    rows = (len(lines) + ncol - 1) // ncol
    fig.legend(loc="lower center", ncol=ncol, bbox_to_anchor=(0.5, 0.0))
    fig.tight_layout(pad=0.3, rect=(0, 0.07 * rows + 0.06, 1, 1))
    return fig


def histogram_figure(spec: dict[str, Any]) -> Any:
    hist = spec["histogram"]
    counts = np.asarray(hist["counts"], dtype=float)
    width_in = WIDTH_PX / DPI
    fig, ax = plt.subplots(figsize=(width_in, width_in * 0.62), dpi=DPI)
    levels = np.arange(256)
    ax.bar(levels, counts, width=1.0, color=OKABE_ITO[0], label="Measured")
    mean, sigma, pixels = hist["mean"], hist["sigma"], hist["pixels"]
    expected = (
        pixels * np.exp(-((levels - mean) ** 2) / (2 * sigma**2)) / (sigma * np.sqrt(2 * np.pi))
    )
    ax.plot(levels, expected, color=OKABE_ITO[1], linewidth=2, linestyle="--", label="Normal curve")
    ax.set_xlim(40, 216)
    ax.set_xlabel("Value")
    ax.set_ylabel("Pixels")
    ax.legend(loc="upper left")
    fig.tight_layout(pad=0.3)
    return fig


def draw(spec: dict[str, Any]) -> Any:
    if "panels" in spec:
        return panels_figure(spec)
    if "profile" in spec:
        return profile_figure(spec)
    return histogram_figure(spec)


def main() -> int:
    files = sorted(DATA.glob("*.json"))
    if not files:
        print("No figure data. Run: pnpm --filter @pixelnexus/web gen:filter-docs")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    for file in files:
        spec = json.loads(file.read_text(encoding="utf-8"))
        for theme in THEMES:
            style(theme)
            fig = draw(spec)
            target = OUT / f"{spec['filter']}-{theme}.svg"
            buffer = io.StringIO()
            fig.savefig(buffer, format="svg", metadata={"Date": None, "Creator": None})
            plt.close(fig)
            # Write LF line endings on every platform, so both PCs produce the same files.
            target.write_text(buffer.getvalue(), encoding="utf-8", newline="\n")
    print(f"Drew {len(files) * len(THEMES)} figures in {OUT.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
