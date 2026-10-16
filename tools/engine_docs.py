"""Docs material for science engine filters, made by the real engine code.

Usage:
    uv run python tools/engine_docs.py           # write the files
    uv run python tools/engine_docs.py --check   # fail if the docs fragments are out of date

It does for engine filters what web/scripts/gen-filter-docs.mjs does for browser filters:
    docs/_generated/examples/<id>.md   worked examples (committed)
    docs/_generated/kernels/<id>.md    operator facts (committed)
    tools/figures/data/<id>.json       arrays for tools/figures/make_figures.py (not committed)

Test images come from tools/synthetic.py, which matches the studio's own test images.
"""

from __future__ import annotations

import argparse
import io
import itertools
import json
import math
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import pywt
from numpy.typing import NDArray
from PIL import Image
from scipy import ndimage

from pixelnexus_engine.filters.artifacts import (
    atmospheric_light,
    dark_channel,
    deband,
    deblock,
    dehaze,
    dehaze_parts,
    dering,
    descreen,
    jpeg_cleanup,
)
from pixelnexus_engine.filters.blobs import blob_dog_filter, blob_doh_filter, blob_log_filter
from pixelnexus_engine.filters.contours import (
    active_contour_filter,
    chan_vese_filter,
    chan_vese_level_set,
    level_set,
    level_set_inside,
    snake_result,
)
from pixelnexus_engine.filters.directional import (
    BANKS,
    directional_curvelet,
    directional_shearlet,
    frequency_grid,
)
from pixelnexus_engine.filters.edge_preserving import (
    domain_transform,
    nlm,
    rolling_guidance,
    susan_smoothing,
    tv_denoise,
)
from pixelnexus_engine.filters.hough import (
    circle_rows,
    edges,
    hough_circles,
    hough_lines,
    hough_linking,
    segment_rows,
)
from pixelnexus_engine.filters.inpainting import inpaint
from pixelnexus_engine.filters.interactive import (
    grabcut,
    grabcut_inside,
    graph_cut,
    graph_cut_inside,
    random_walker_filter,
    walker_probability,
)
from pixelnexus_engine.filters.keypoints import akaze, brisk, orb, sift
from pixelnexus_engine.filters.matched import correlation_map, matched_filter, ncc_map
from pixelnexus_engine.filters.mser import mser
from pixelnexus_engine.filters.phase import phase_congruency, phase_congruency_filter
from pixelnexus_engine.filters.plugplay import pnp_admm_filter, red_filter
from pixelnexus_engine.filters.radon import back_project, radon_filter, ridgelet, sinogram
from pixelnexus_engine.filters.restoration import (
    blind_deconv,
    blind_rl,
    centered_grid,
    psf_picture,
    sparse_fista,
    support_mask,
    tv_deblur,
)
from pixelnexus_engine.filters.ridges import (
    frangi_filter,
    hessian_filter,
    meijering_filter,
    sato_filter,
)
from pixelnexus_engine.filters.robust import fit_surface, m_estimator, ransac_surface
from pixelnexus_engine.filters.segmentation import (
    elevation,
    felzenszwalb_filter,
    felzenszwalb_labels,
    marker_watershed,
    marker_watershed_labels,
    mean_shift,
    mean_shift_colors,
    multi_otsu,
    multi_otsu_labels,
    multi_otsu_thresholds,
    quickshift_filter,
    quickshift_labels,
    similar_color_labels,
    slic_filter,
    slic_labels,
    watershed_filter,
    watershed_labels,
)
from pixelnexus_engine.filters.split_merge import luma as split_luma
from pixelnexus_engine.filters.split_merge import merge_regions, split_blocks, split_merge
from pixelnexus_engine.filters.steerable import band_noise, steerable_pyramid
from pixelnexus_engine.filters.structured_edge import MODEL_ID, structured_edge
from pixelnexus_engine.filters.superresolution import Grid, sr_classical
from pixelnexus_engine.filters.superresolution import back_project as sr_back_project
from pixelnexus_engine.filters.surf import surf_inspired
from pixelnexus_engine.filters.susan import susan_corner
from pixelnexus_engine.filters.texture import glcm, hog_filter, hog_view, lbp, ltp, ltp_codes
from pixelnexus_engine.filters.tree_morphology import (
    area_closing_filter,
    area_opening_filter,
    attribute_opening,
    axis_and_distance,
    medial_axis_filter,
)
from pixelnexus_engine.filters.wavelets import (
    WINDOWS,
    estimate_sigma,
    local_signal_variance,
    stationary_plane,
    subband_thresholds,
    swt_denoise,
    wavelet_threshold,
    wavelet_threshold_plane,
    wavelet_wiener,
    wiener_gain,
)
from pixelnexus_engine.models import model_entry, model_path
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.psf import extend, gaussian_kernel
from pixelnexus_engine.registry import common_params, science_entries
from synthetic import disks, siemens_star

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog" / "filters"
DATA = ROOT / "tools" / "figures" / "data"
Gray = NDArray[np.uint8]


def header(filter_id: str) -> str:
    return (
        f"<!-- Generated by tools/engine_docs.py from the {filter_id} engine code. "
        "Do not edit. -->\n\n"
    )


def catalog_values(filter_id: str, **values: Any) -> dict[str, Any]:
    """Values checked against the catalog entry, with its defaults, as the engine API does."""
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), values)


def rgba(gray: Gray) -> NDArray[np.uint8]:
    out = np.empty((*gray.shape, 4), dtype=np.uint8)
    out[..., :3] = gray[..., None]
    out[..., 3] = 255
    return out


def run(filter_function: Callable[..., Any], gray: Gray, filter_id: str, **values: Any) -> Gray:
    """Run an engine filter on a gray image and return the red channel of the result."""
    result = filter_function(rgba(gray), catalog_values(filter_id, **values), lambda _: None)
    return np.asarray(result[..., 0], dtype=np.uint8)


def psnr(image: Gray, reference: Gray) -> float:
    error = np.mean((image.astype(np.float64) - reference.astype(np.float64)) ** 2)
    return math.inf if error == 0 else 10 * math.log10(255**2 / error)


def fix(value: float, digits: int) -> str:
    return f"{value:.{digits}f}"


def md_table(headers: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join(lines) + "\n"


def picture(gray: Gray) -> dict[str, Any]:
    height, width = gray.shape
    return {"width": width, "height": height, "color": False, "data": gray.ravel().tolist()}


def noisy(clean: Gray, sigma: float, seed: int) -> Gray:
    """Gaussian noise from NumPy's default_rng, rounded and clipped to 8 bits."""
    noise = np.random.default_rng(seed).normal(0, sigma, clean.shape)
    return np.clip(np.rint(clean + noise), 0, 255).astype(np.uint8)


# Wavelet thresholding ---------------------------------------------------------------------------

RULES = [("visushrink", "VisuShrink"), ("bayesshrink", "BayesShrink"), ("sureshrink", "SureShrink")]


def wavelet_threshold_docs(out: dict[Path, str]) -> None:
    filter_id = "wavelet-threshold"
    clean = disks(160, 160)
    damaged = noisy(clean, 20, 7)

    def result(rule: str, mode: str = "soft") -> Gray:
        return run(wavelet_threshold, damaged, filter_id, rule=rule, mode=mode)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Disks with Gaussian noise of sigma 20, and the result of three "
            "threshold rules with the default sym4 wavelet, 3 levels and soft thresholding.",
            "panels": [
                {"title": "Noisy", "image": picture(damaged)},
                *({"title": label, "image": picture(result(rule))} for rule, label in RULES),
            ],
        },
        separators=(",", ":"),
    )

    rows = [
        [label, fix(psnr(result(rule), clean), 2), fix(psnr(result(rule, "hard"), clean), 2)]
        for rule, label in RULES
    ]
    params = catalog_values(filter_id)
    plane = damaged.astype(np.float64)
    coeffs = pywt.wavedec2(plane, params["wavelet"], mode="symmetric", level=params["levels"])
    sigma = estimate_sigma(coeffs[-1][2])
    finest = {
        label: subband_thresholds(coeffs, {**params, "rule": rule}, sigma, plane.size)[-1]
        for rule, label in RULES
    }
    threshold_rows = [[label, *(fix(t, 2) for t in finest[label])] for _rule, label in RULES]
    best_soft = max(rows, key=lambda row: float(row[1]))[0]
    best_hard = max(rows, key=lambda row: float(row[2]))[0]
    finest_size = coeffs[-1][0].size
    universal = sigma * math.sqrt(2 * math.log(finest_size))
    sparse = all(math.isclose(t, universal) for t in finest["SureShrink"])
    # The text below says that VisuShrink keeps the largest thresholds on the coarsest level.
    coarsest = {
        rule: max(subband_thresholds(coeffs, {**params, "rule": rule}, sigma, plane.size)[0])
        for rule, _label in RULES
    }
    assert coarsest["visushrink"] > 2 * max(coarsest["bayesshrink"], coarsest["sureshrink"])
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Threshold rule", "Soft", "Hard"], rows)
        + "\nThe PSNR in dB against the clean disks, 160 by 160 pixels, for the disks with "
        f"Gaussian noise of sigma 20, {fix(psnr(damaged, clean), 2)} dB before the filter. The "
        "noise comes from NumPy's default_rng with seed 7 and is rounded to 8 bits. The other "
        "settings are the defaults: sym4, 3 levels and the estimated noise sigma.\n\n"
        + md_table(["Threshold rule", "T for h_1", "T for v_1", "T for d_1"], threshold_rows)
        + f"\nThe thresholds of the finest level. The estimated noise sigma is {fix(sigma, 2)}, "
        "close to the 20 that was added. VisuShrink uses one threshold for every subband, "
        f"sigma sqrt(2 ln N) with N = {plane.size} pixels. BayesShrink gives each subband its "
        "own. Its threshold for d_1 is high, because the disks leave little signal in the "
        "finest diagonal details. "
        + (
            "SureShrink found all three finest subbands sparse, so its hybrid rule chose the "
            f"universal threshold of their size, sigma sqrt(2 ln {finest_size}).\n"
            if sparse
            else "SureShrink chose a threshold for each subband by SURE.\n"
        )
        + f"\nWith soft thresholding, {best_soft} gives the highest PSNR. VisuShrink keeps its "
        "large threshold on the coarsest level too, where the disks put most of their signal "
        "and the other rules use much lower thresholds. Soft thresholding also shrinks the edges "
        f"it keeps, so VisuShrink blurs the most. With hard thresholding, {best_hard} gives the "
        "highest PSNR, since hard thresholding keeps the edges at full size.\n"
    )

    lines = [
        [
            name,
            str(pywt.Wavelet(name).dec_len),
            str(pywt.Wavelet(name).vanishing_moments_psi),
        ]
        for name in ("haar", "db2", "db4", "db8", "sym4", "sym8", "coif1", "coif3")
    ]
    sym4 = pywt.Wavelet("sym4")
    taps = ",\\ ".join(f"{v:.4f}" for v in sym4.dec_lo)
    high = ",\\ ".join(f"{v:.4f}" for v in sym4.dec_hi)
    out[ROOT / "docs" / "_generated" / "kernels" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Wavelet", "Taps per filter", "Vanishing moments"], lines)
        + "\nThe taps and vanishing moments as PyWavelets reports them. The analysis filters of "
        "the default sym4 wavelet, rounded to 4 decimals:\n\n"
        + f"\\[\nf_{{\\text{{low}}}} = ({taps})\n\\]\n\n"
        + f"\\[\nf_{{\\text{{high}}}} = ({high})\n\\]\n"
    )


# Stationary wavelet filtering -------------------------------------------------------------------


def swt_denoise_docs(out: dict[Path, str]) -> None:
    filter_id = "swt-denoise"
    clean = disks(160, 160)
    damaged = noisy(clean, 20, 7)

    def swt(**values: Any) -> Gray:
        return run(swt_denoise, damaged, filter_id, **values)

    def dwt(**values: Any) -> Gray:
        return run(wavelet_threshold, damaged, "wavelet-threshold", **values)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Disks with Gaussian noise of sigma 20, filtered with the Haar wavelet "
            "by the decimated transform, by cycle spinning with 2 shifts, and by the stationary "
            "transform.",
            "panels": [
                {"title": "Noisy", "image": picture(damaged)},
                {"title": "Decimated", "image": picture(dwt(wavelet="haar"))},
                {
                    "title": "Cycle spinning, 2",
                    "image": picture(swt(wavelet="haar", transform="cycle-spinning", shifts=2)),
                },
                {"title": "Stationary", "image": picture(swt(wavelet="haar"))},
            ],
        },
        separators=(",", ":"),
    )

    columns = ["Decimated", "Cycle spinning, 2", "Cycle spinning, 4", "Stationary"]
    rows = []
    for wavelet in ("haar", "sym4"):
        results = [
            dwt(wavelet=wavelet),
            swt(wavelet=wavelet, transform="cycle-spinning", shifts=2),
            swt(wavelet=wavelet, transform="cycle-spinning", shifts=4),
            swt(wavelet=wavelet),
        ]
        rows.append([wavelet, *(fix(psnr(r, clean), 2) for r in results)])
    rise = {row[0]: float(row[4]) - float(row[1]) for row in rows}
    near = max(abs(float(row[3]) - float(row[4])) for row in rows)

    plane = damaged.astype(np.float64)
    moved = np.roll(plane, (3, 5), axis=(0, 1))

    def drift(function: Callable[[Any, dict[str, Any]], Any], filter_id: str) -> float:
        params = catalog_values(filter_id, border="wrap")
        first = np.roll(function(plane, params), (3, 5), axis=(0, 1))
        return float(np.abs(function(moved, params) - first).max())

    decimated_drift = drift(wavelet_threshold_plane, "wavelet-threshold")
    stationary_drift = drift(stationary_plane, filter_id)
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Wavelet", *columns], rows)
        + "\nThe PSNR in dB against the clean disks, for the disks with Gaussian noise of "
        f"sigma 20, {fix(psnr(damaged, clean), 2)} dB before the filter. The image and the "
        "noise are those of the wavelet thresholding example. All columns use BayesShrink, soft "
        "thresholding, 3 levels and the estimated noise sigma. Decimated is wavelet "
        "thresholding. The stationary transform covers all 8 x 8 shifts of 3 levels. It "
        f"raises the PSNR by {fix(rise['haar'], 2)} dB with Haar and by {fix(rise['sym4'], 2)} "
        f"dB with sym4. With 4 shifts, cycle spinning comes within {fix(near, 2)} dB of it.\n\n"
        + md_table(
            ["Transform", "Largest change"],
            [["Decimated", fix(decimated_drift, 2)], ["Stationary", fix(stationary_drift, 2)]],
        )
        + "\nThe noisy image is moved in a circle by 3 rows and 5 columns, filtered, and "
        "compared with the filtered image moved the same way. The table shows the largest "
        "difference in pixel values, before rounding. Both use the Wrap border mode. The "
        "decimated transform gives a different result for the moved image. The stationary "
        "transform gives the same result, moved.\n"
    )


# Wavelet Wiener filtering -------------------------------------------------------------------


def wavelet_wiener_docs(out: dict[Path, str]) -> None:
    filter_id = "wavelet-wiener"
    clean = disks(160, 160)
    damaged = noisy(clean, 20, 7)

    def wiener(**values: Any) -> Gray:
        return run(wavelet_wiener, damaged, filter_id, **values)

    threshold = run(wavelet_threshold, damaged, "wavelet-threshold")
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Disks with Gaussian noise of sigma 20, filtered by wavelet "
            "thresholding with BayesShrink, and by wavelet Wiener filtering with the smallest "
            "estimate and with a 9 x 9 window.",
            "panels": [
                {"title": "Noisy", "image": picture(damaged)},
                {"title": "BayesShrink", "image": picture(threshold)},
                {"title": "Wiener, smallest", "image": picture(wiener())},
                {"title": "Wiener, 9 x 9", "image": picture(wiener(window="9x9"))},
            ],
        },
        separators=(",", ":"),
    )

    labels = {w: "Smallest of 3x3 to 9x9" if w == "min" else w.replace("x", " x ") for w in WINDOWS}
    rows = [[labels[w], fix(psnr(wiener(window=w), clean), 2)] for w in WINDOWS]
    rows.append(["Wavelet thresholding, BayesShrink", fix(psnr(threshold, clean), 2)])

    params = catalog_values(filter_id)
    plane = damaged.astype(np.float64)
    coeffs = pywt.wavedec2(plane, params["wavelet"], mode="symmetric", level=params["levels"])
    sigma = estimate_sigma(coeffs[-1][2])
    sizes = WINDOWS[params["window"]]
    gain_rows = []
    for index, level in enumerate(coeffs[1:]):
        number = len(coeffs) - 1 - index
        gains = [
            float(np.mean(wiener_gain(local_signal_variance(band, sigma, sizes), sigma)))
            for band in level
        ]
        gain_rows.append([str(number), *(fix(g, 3) for g in gains)])
    gain_rows.reverse()
    # The text below says that the mean gain grows from the finest to the coarsest level.
    means = [np.mean([float(g) for g in row[1:]]) for row in gain_rows]
    assert all(a < b for a, b in itertools.pairwise(means))
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Window", "PSNR in dB"], rows)
        + "\nThe PSNR against the clean disks, for the disks with Gaussian noise of sigma 20, "
        f"{fix(psnr(damaged, clean), 2)} dB before the filter. The image and the noise are "
        "those of the wavelet thresholding example. The Wiener rows use the defaults: db4, "
        "4 levels and the estimated noise sigma. The last row is wavelet thresholding with its "
        "defaults.\n\n"
        + md_table(["Level", "Mean gain h", "Mean gain v", "Mean gain d"], gain_rows)
        + f"\nThe mean Wiener gain in each subband with the default settings. The estimated "
        f"noise sigma is {fix(sigma, 2)}. Level 1 is the finest. The gains are lowest there, "
        "where the details are mostly noise, and highest at the coarsest level, where the "
        "disks put most of their signal.\n"
    )


# Radon transform filters -------------------------------------------------------------------


def lines_image(size: int = 160) -> Gray:
    """Three straight lines, 3 pixels wide, at 200 on a background of 60."""
    y, x = np.mgrid[0:size, 0:size]
    image = np.full((size, size), 60.0)
    for a, b, c in ((1, 0.4, -60), (0.3, -1, 90), (1, -1, 10)):
        distance = np.abs(a * x + b * y + c) / math.hypot(a, b)
        image = np.where(distance < 1.5, 200.0, image)
    return image.astype(np.uint8)


def radon_docs(out: dict[Path, str]) -> None:
    filter_id = "radon-filter"
    clean = disks(160, 160)

    def radon(**values: Any) -> Gray:
        return run(radon_filter, clean, filter_id, **values)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "The disks, their sinogram, the plain back projection, and the filtered "
            "back projection with 180 angles, with 30 angles, and with 180 angles and the Hann "
            "window.",
            "panels": [
                {"title": "Disks", "image": picture(clean)},
                {"title": "Sinogram", "image": picture(radon(output="sinogram"))},
                {"title": "No filter", "image": picture(radon(output="backprojection"))},
                {"title": "Ramp, 180", "image": picture(radon())},
                {"title": "Ramp, 30", "image": picture(radon(angles=30))},
                {"title": "Hann, 180", "image": picture(radon(window="hann"))},
            ],
        },
        separators=(",", ":"),
    )

    counts = [10, 30, 90, 180, 360]
    rows = [
        [w.capitalize(), *(fix(psnr(radon(angles=n, window=w), clean), 2) for n in counts)]
        for w in ("ramp", "hann")
    ]
    image = np.random.default_rng(0).random((48, 48))
    values, _ = sinogram(image, 4)
    pad = (values.shape[0] - 48) // 2
    slice_error = float(
        np.abs(np.fft.fft(values[pad : pad + 48, 0]) - np.fft.fft2(image)[0, :]).max()
    )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Window", *(f"{n} angles" for n in counts)], rows)
        + "\nThe PSNR in dB of the filtered back projection against the disks, 160 by 160 "
        "pixels. Here more angles help up to about 180. Beyond that, the sampled transform "
        "itself limits the result. The Hann window gives a lower PSNR on this clean image, "
        "since it softens fine detail. On noisy projections, it softens the noise too.\n\n"
        "The Fourier slice theorem can be checked exactly at 0 degrees, where a projection is "
        "the sum of each column. For a random image of 48 by 48 pixels, the 1-D FFT of that "
        "projection and the row f_y = 0 of the 2-D FFT of the image differ by "
        + ("less than 1e-12" if slice_error < 1e-12 else f"at most {slice_error:.1e}")
        + ", which is rounding.\n"
    )


def ridgelet_docs(out: dict[Path, str]) -> None:
    filter_id = "ridgelet"
    clean = lines_image()
    damaged = noisy(clean, 20, 7)

    def ridge(**values: Any) -> Gray:
        return run(ridgelet, damaged, filter_id, **values)

    threshold = run(wavelet_threshold, damaged, "wavelet-threshold")
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Three lines with Gaussian noise of sigma 20, the Radon round trip "
            "alone, ridgelet filtering with the defaults, and wavelet thresholding.",
            "panels": [
                {"title": "Noisy", "image": picture(damaged)},
                {"title": "Round trip", "image": picture(ridge(factor=0))},
                {"title": "Ridgelet", "image": picture(ridge())},
                {"title": "Wavelet threshold", "image": picture(threshold)},
            ],
        },
        separators=(",", ":"),
    )
    values, offset = sinogram(clean.astype(np.float64), 180)
    cap = psnr(
        np.clip(np.rint(back_project(values, clean.shape, offset, "ramp")), 0, 255).astype(
            np.uint8
        ),
        clean,
    )
    rows = [
        ["Noisy", fix(psnr(damaged, clean), 2)],
        ["Radon round trip, factor 0", fix(psnr(ridge(factor=0), clean), 2)],
        *([f"Ridgelet, factor {k}", fix(psnr(ridge(factor=k), clean), 2)] for k in (2, 3, 4)),
        ["Wavelet thresholding, BayesShrink", fix(psnr(threshold, clean), 2)],
    ]
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Result", "PSNR in dB"], rows)
        + "\nThree straight lines, 3 pixels wide, at 200 on a background of 60, 160 by 160 "
        "pixels, with Gaussian noise of sigma 20 from NumPy's default_rng with seed 7. The "
        "ridgelet rows use 180 angles, db4, 4 levels and hard thresholding. The Radon round trip "
        "alone, without noise, gives the clean lines back at only "
        f"{fix(cap, 2)} dB, since the sampled transform blurs thin lines. That caps what any "
        "threshold can reach. Here ridgelet filtering beats the round trip but not wavelet "
        "thresholding.\n"
    )


# Directional filters ------------------------------------------------------------------------


def directional_docs(out: dict[Path, str], bank: str) -> None:
    filter_id = f"directional-{bank}"
    function = directional_curvelet if bank == "curvelet" else directional_shearlet
    name = "Curvelet-inspired" if bank == "curvelet" else "Shearlet-inspired"
    lines = lines_image()
    damaged = noisy(lines, 20, 7)

    def directional(gray: Gray, **values: Any) -> Gray:
        return run(function, gray, filter_id, **values)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": f"Three lines with Gaussian noise of sigma 20, the {name.lower()} filter "
            "removing noise with the defaults, wavelet thresholding, and the clean lines with "
            "only the direction of the 135 degree line kept, without the coarse part.",
            "panels": [
                {"title": "Noisy", "image": picture(damaged)},
                {"title": name, "image": picture(directional(damaged))},
                {
                    "title": "Wavelet threshold",
                    "image": picture(run(wavelet_threshold, damaged, "wavelet-threshold")),
                },
                {
                    "title": "Lines at 135 degrees",
                    "image": picture(
                        directional(lines, mode="orientation", direction=135, keepCoarse=False)
                    ),
                },
            ],
        },
        separators=(",", ":"),
    )

    rows = []
    for label, clean in (("Lines", lines), ("Disks", disks(160, 160))):
        dirty = noisy(clean, 20, 7)
        rows.append(
            [
                label,
                fix(psnr(dirty, clean), 2),
                *(fix(psnr(directional(dirty, factor=k), clean), 2) for k in (2, 3, 4)),
                fix(psnr(run(wavelet_threshold, dirty, "wavelet-threshold"), clean), 2),
                fix(psnr(run(swt_denoise, dirty, "swt-denoise"), clean), 2),
            ]
        )
    params = catalog_values(filter_id)
    fx, fy = frequency_grid(64, 64)
    tiles = BANKS[bank](fx, fy, params["scales"], int(params["directions"]))
    per_scale = [
        sum(1 for t in tiles if t.scale == s and t.angle is not None)
        for s in range(params["scales"])
    ]
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(
            ["Image", "Noisy", "Factor 2", "Factor 3", "Factor 4", "Wavelet", "Stationary"],
            rows,
        )
        + "\nThe PSNR in dB against the clean image, for Gaussian noise of sigma 20 from "
        "NumPy's default_rng with seed 7. Both images are 160 by 160 pixels. The lines image "
        "has three straight lines, 3 pixels wide. Factor 2 to 4 is the threshold factor of this "
        "filter, with its other defaults. Wavelet is wavelet thresholding and Stationary is "
        "stationary wavelet filtering, both with their defaults. With the defaults there are "
        f"{', '.join(str(n) for n in per_scale)} directional tiles from the finest scale to the "
        "coarsest, plus the low-pass tile.\n"
    )


# Steerable pyramid -------------------------------------------------------------------------


def steerable_docs(out: dict[Path, str]) -> None:
    filter_id = "steerable-pyramid"
    clean = disks(160, 160)
    damaged = noisy(clean, 20, 7)

    def pyramid(gray: Gray, **values: Any) -> Gray:
        return run(steerable_pyramid, gray, filter_id, **values)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Disks with Gaussian noise of sigma 20, the steerable pyramid removing "
            "noise with the defaults, wavelet thresholding, and the clean disks with the band "
            "of level 2 steered to lines at 45 degrees.",
            "panels": [
                {"title": "Noisy", "image": picture(damaged)},
                {"title": "Steerable pyramid", "image": picture(pyramid(damaged))},
                {
                    "title": "Wavelet threshold",
                    "image": picture(run(wavelet_threshold, damaged, "wavelet-threshold")),
                },
                {
                    "title": "Level 2 at 45 degrees",
                    "image": picture(pyramid(clean, output="band", level=2, direction=45)),
                },
            ],
        },
        separators=(",", ":"),
    )

    rows = []
    for label, image in (("Lines", lines_image()), ("Disks", clean)):
        dirty = noisy(image, 20, 7)
        rows.append(
            [
                label,
                fix(psnr(dirty, image), 2),
                *(fix(psnr(pyramid(dirty, orientations=n), image), 2) for n in ("2", "4", "8")),
                fix(psnr(pyramid(dirty, mode="soft", factor=1.5), image), 2),
                fix(psnr(run(wavelet_threshold, dirty, "wavelet-threshold"), image), 2),
                fix(psnr(run(swt_denoise, dirty, "swt-denoise"), image), 2),
            ]
        )
    rebuilt = pyramid(clean, factor=0)
    rebuild_error = int(np.abs(rebuilt.astype(int) - clean.astype(int)).max())
    noise = band_noise((256, 256), 4, 4)
    levels = ", ".join(fix(noise[(j, 0)], 3) for j in range(4))
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(
            [
                "Image",
                "Noisy",
                "2 orient.",
                "4 orient.",
                "8 orient.",
                "Soft 1.5",
                "Wavelet",
                "Stationary",
            ],
            rows,
        )
        + "\nThe PSNR in dB against the clean image, for Gaussian noise of sigma 20 from "
        "NumPy's default_rng with seed 7. Both images are 160 by 160 pixels. The lines image "
        "has three straight lines, 3 pixels wide. The orientation columns use hard "
        "thresholding with factor 3 and 4 levels. Soft 1.5 uses 4 orientations and soft "
        "thresholding with factor 1.5. Wavelet is wavelet thresholding and Stationary is "
        "stationary wavelet filtering, both with their defaults.\n\n"
        + (
            "With factor 0, the result equals the clean disks in every pixel, so the pyramid "
            "gives the image back. "
            if rebuild_error == 0
            else "With factor 0, the result differs from the clean disks by at most "
            f"{rebuild_error} levels. "
        )
        + "For an image of 256 by "
        "256 pixels with 4 orientations, the norm of the band filter, which is the noise level "
        f"for sigma 1, is {levels} from level 1 to level 4. It doubles with each level, since "
        "pyrtools does not rescale the spectrum when it crops it to half the size.\n"
    )


# Regularized and blind deconvolution ------------------------------------------------------


def blurred(clean: Gray, sigma: float, noise: float, seed: int = 7) -> Gray:
    """The image blurred with the Gaussian PSF of the deconvolution filters, with the reflect
    border, plus Gaussian noise, rounded and clipped to 8 bits."""
    values = ndimage.convolve(clean.astype(np.float64), gaussian_kernel(sigma), mode="reflect")
    values += np.random.default_rng(seed).normal(0, noise, clean.shape)
    out: Gray = np.clip(np.rint(values), 0, 255).astype(np.uint8)
    return out


def tv_deblur_docs(out: dict[Path, str]) -> None:
    filter_id = "tv-deblur"
    clean = disks(160, 160)
    damaged = blurred(clean, 2, 5)

    def tv(gray: Gray, **values: Any) -> Gray:
        return run(tv_deblur, gray, filter_id, **values)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Disks blurred with a Gaussian of sigma 2 and Gaussian noise of sigma 5, "
            "and total variation restoration with lambda 0.3, 3 and 30.",
            "panels": [
                {"title": "Blurred, noisy", "image": picture(damaged)},
                *(
                    {"title": f"Lambda {lam:g}", "image": picture(tv(damaged, **{"lambda": lam}))}
                    for lam in (0.3, 3, 30)
                ),
            ],
        },
        separators=(",", ":"),
    )
    lambdas = (0.3, 1, 3, 10, 30)
    rows = []
    for label, image in (("Disks", clean), ("Siemens star", siemens_star(160, 160))):
        dirty = blurred(image, 2, 5)
        rows.append(
            [
                label,
                fix(psnr(dirty, image), 2),
                *(fix(psnr(tv(dirty, **{"lambda": lam}), image), 2) for lam in lambdas),
                fix(psnr(tv(dirty, iterations=300), image), 2),
            ]
        )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(
            ["Image", "Blurred", *(f"Lambda {lam:g}" for lam in lambdas), "300 iterations"], rows
        )
        + "\nThe PSNR in dB against the sharp image. Both images are 160 by 160 pixels, "
        "blurred with the Gaussian PSF of sigma 2 and the reflect border, with Gaussian noise of "
        "sigma 5 from NumPy's default_rng with seed 7. The lambda columns use 100 iterations. "
        "The last column uses the default lambda of 3 and 300 iterations, which still gains, "
        "so 100 iterations stop short of the minimum. The disks are flat shapes, which total "
        "variation suits, so they gain more than the fine spokes of the star.\n"
    )


def sparse_fista_docs(out: dict[Path, str]) -> None:
    filter_id = "sparse-fista"
    clean = disks(160, 160)
    damaged = blurred(clean, 2, 5)

    def sparse(gray: Gray, **values: Any) -> Gray:
        return run(sparse_fista, gray, filter_id, **values)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Disks blurred with a Gaussian of sigma 2 and Gaussian noise of sigma 5, "
            "the data term alone after 100 steps, sparse regularization with the defaults, and "
            "with the Haar wavelet and lambda 4.",
            "panels": [
                {"title": "Blurred, noisy", "image": picture(damaged)},
                {"title": "Lambda 0", "image": picture(sparse(damaged, **{"lambda": 0}))},
                {"title": "Sym8, lambda 1", "image": picture(sparse(damaged))},
                {
                    "title": "Haar, lambda 4",
                    "image": picture(sparse(damaged, wavelet="haar", **{"lambda": 4})),
                },
            ],
        },
        separators=(",", ":"),
    )
    lambdas = (0, 0.5, 1, 2, 4)
    wavelets = ("haar", "db4", "sym8")
    rows = [
        [
            w,
            *(
                fix(psnr(sparse(damaged, wavelet=w, **{"lambda": lam}), clean), 2)
                for lam in lambdas
            ),
        ]
        for w in wavelets
    ]
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Wavelet", *(f"Lambda {lam:g}" for lam in lambdas)], rows)
        + "\nThe PSNR in dB against the sharp disks, 160 by 160 pixels, blurred with the "
        "Gaussian PSF of sigma 2 and the reflect border, with Gaussian noise of sigma 5 from "
        "NumPy's default_rng with seed 7. The blurred image itself has "
        f"{fix(psnr(damaged, clean), 2)} dB. All rows use 3 levels and 100 iterations. Lambda 0 "
        "is the data term alone, which raises the noise as it sharpens. Total variation "
        f"restoration reaches {fix(psnr(run(tv_deblur, damaged, 'tv-deblur'), clean), 2)} dB "
        "on the same image with its defaults, since the disks are flat shapes.\n"
    )


def blind_deconv_docs(out: dict[Path, str]) -> None:
    filter_id = "blind-deconv"
    clean = siemens_star(160, 160)
    damaged = blurred(clean, 2, 1)

    def blind(**values: Any) -> Gray:
        return run(blind_deconv, damaged, filter_id, **values)

    truth = centered_grid(gaussian_kernel(2), clean.shape) * support_mask(clean.shape, 7)
    truth_picture = np.clip(np.rint(psf_picture(truth, 7, clean.shape)), 0, 255).astype(np.uint8)
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "A Siemens star blurred with a Gaussian of sigma 2, the result of blind "
            "deconvolution with the defaults, the PSF it found, and the true PSF.",
            "panels": [
                {"title": "Blurred", "image": picture(damaged)},
                {"title": "Blind result", "image": picture(blind())},
                {"title": "PSF found", "image": picture(blind(output="psf"))},
                {"title": "True PSF", "image": picture(truth_picture)},
            ],
        },
        separators=(",", ":"),
    )
    g, _ = extend(damaged.astype(np.float64), "reflect")
    true_grid = centered_grid(gaussian_kernel(2), g.shape)
    rows = []
    for sigma in (0.5, 1, 2, 3, 5):
        start = centered_grid(gaussian_kernel(sigma), g.shape) * support_mask(g.shape, 7)
        start /= start.sum()
        _, h = blind_rl(g, start, 7, 10, 5, 5)
        rows.append(
            [
                fix(sigma, 1),
                fix(float(np.abs(start - true_grid).sum()), 2),
                fix(float(np.abs(h - true_grid).sum()), 2),
                fix(psnr(blind(sigma=sigma), clean), 2),
            ]
        )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["First guess sigma", "Start error", "Error after", "PSNR in dB"], rows)
        + "\nA Siemens star of 160 by 160 pixels, blurred with the Gaussian PSF of sigma 2 and "
        "the reflect border, with Gaussian noise of sigma 1 from NumPy's default_rng with seed "
        f"7. The blurred image has {fix(psnr(damaged, clean), 2)} dB. The errors are the sum "
        "of the absolute differences between the PSF and the true PSF, before and after the "
        "default 10 cycles. A narrow first guess barely moves, since the sharp image with a "
        "single bright point already fits the photo well. Wider guesses move toward the true "
        "PSF.\n"
    )


# Plug-and-play restoration ------------------------------------------------------------------

DENOISER_LABELS = [
    ("wavelet", "Wavelet"),
    ("stationary", "Stationary"),
    ("nlm", "Non-local means"),
]


def plugplay_docs(out: dict[Path, str], filter_id: str) -> None:
    function = pnp_admm_filter if filter_id == "pnp-admm" else red_filter
    name = "plug-and-play ADMM" if filter_id == "pnp-admm" else "RED"
    clean = disks(160, 160)
    damaged = blurred(clean, 2, 5)

    def restore(gray: Gray, **values: Any) -> Gray:
        return run(function, gray, filter_id, **values)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Disks blurred with a Gaussian of sigma 2 and Gaussian noise of sigma 5, "
            f"and {name} with its other defaults and each of the three denoisers.",
            "panels": [
                {"title": "Blurred, noisy", "image": picture(damaged)},
                *(
                    {"title": label, "image": picture(restore(damaged, denoiser=kind))}
                    for kind, label in DENOISER_LABELS
                ),
            ],
        },
        separators=(",", ":"),
    )
    star = siemens_star(160, 160)
    dirty_star = blurred(star, 2, 5)
    rows = [
        [
            label,
            fix(psnr(restore(damaged, denoiser=kind), clean), 2),
            fix(psnr(restore(dirty_star, denoiser=kind), star), 2),
        ]
        for kind, label in DENOISER_LABELS
    ]
    rows.append(
        [
            "Total variation restoration",
            fix(psnr(run(tv_deblur, damaged, "tv-deblur"), clean), 2),
            fix(psnr(run(tv_deblur, dirty_star, "tv-deblur"), star), 2),
        ]
    )
    settings = (
        "lambda 10, rho 0.1, gamma 1 and 20 iterations"
        if filter_id == "pnp-admm"
        else "lambda 0.02, a noise sigma of 5, a denoiser sigma of 5 and 20 iterations"
    )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Denoiser", "Disks", "Siemens star"], rows)
        + "\nThe PSNR in dB against the sharp image. Both images are 160 by 160 pixels, "
        "blurred with the Gaussian PSF of sigma 2 and the reflect border, with Gaussian noise of "
        "sigma 5 from NumPy's default_rng with seed 7. The blurred images have "
        f"{fix(psnr(damaged, clean), 2)} and {fix(psnr(dirty_star, star), 2)} dB. The "
        f"denoiser rows use {settings}. The last row is total variation restoration with its "
        "defaults, for comparison. Non-local means gives the best result and takes by far the "
        "longest.\n"
    )


# Artifact removal ---------------------------------------------------------------------------

Color = NDArray[np.uint8]


def color_picture(rgb: Color) -> dict[str, Any]:
    height, width = rgb.shape[:2]
    return {"width": width, "height": height, "color": True, "data": rgb.ravel().tolist()}


def rgba_color(rgb: Color) -> NDArray[np.uint8]:
    out = np.empty((*rgb.shape[:2], 4), dtype=np.uint8)
    out[..., :3] = rgb
    out[..., 3] = 255
    return out


def run_color(
    filter_function: Callable[..., Any], rgb: Color, filter_id: str, **values: Any
) -> Color:
    result = filter_function(rgba_color(rgb), catalog_values(filter_id, **values), lambda _: None)
    return np.asarray(result[..., :3], dtype=np.uint8)


def to_8bit(values: NDArray[np.float64]) -> Color:
    out: Color = np.clip(np.rint(values), 0, 255).astype(np.uint8)
    return out


def blocks_scene(size: int = 160) -> NDArray[np.float64]:
    """Colored squares of 20 pixels, each with one channel near 0, and red disks, from 0 to 1.
    NumPy's default_rng with seed 1 picks the colors."""
    rng = np.random.default_rng(1)
    scene = np.zeros((size, size, 3))
    for top in range(0, size, 20):
        for left in range(0, size, 20):
            color = rng.uniform(0, 1, 3)
            color[rng.integers(3)] = rng.uniform(0, 0.15)
            scene[top : top + 20, left : left + 20] = color
    scene[disks(size, size) > 128] = [0.9, 0.2, 0.1]
    return scene


HAZE_LIGHT = np.array([0.85, 0.88, 0.9])


def hazy(scene: NDArray[np.float64], beta: float = 1.6) -> NDArray[np.float64]:
    """The haze model with t = exp(-beta depth), depth from 1 at the top to 0 at the bottom."""
    size = scene.shape[0]
    depth = 1 - np.arange(size)[:, None] / size
    t = np.exp(-beta * depth)[..., None] * np.ones((1, scene.shape[1], 1))
    out: NDArray[np.float64] = scene * t + HAZE_LIGHT * (1 - t)
    return out


def dehaze_docs(out: dict[Path, str]) -> None:
    filter_id = "dehaze"
    scene = blocks_scene()
    clear = to_8bit(scene * 255)
    damaged = to_8bit(hazy(scene) * 255)
    result = run_color(dehaze, damaged, filter_id)
    transmission = run_color(dehaze, damaged, filter_id, output="transmission")[..., 0]
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Colored squares under haze that thickens toward the top, the result of "
            "dehazing with the defaults, the transmission it found, and the scene without haze.",
            "panels": [
                {"title": "Hazy", "image": color_picture(damaged)},
                {"title": "Dehazed", "image": color_picture(result)},
                {"title": "Transmission", "image": picture(transmission)},
                {"title": "Without haze", "image": color_picture(clear)},
            ],
        },
        separators=(",", ":"),
    )
    omegas = (0.8, 0.9, 0.95, 1.0)
    rows = [
        [fix(w, 2), fix(psnr(run_color(dehaze, damaged, filter_id, omega=w), clear), 2)]
        for w in omegas
    ]
    params = catalog_values(filter_id)
    _, t, _ = dehaze_parts(damaged.astype(np.float64) / 255, params)
    rgb = damaged.astype(np.float64) / 255
    light = atmospheric_light(rgb, dark_channel(rgb, params["patch"], params["border"]))
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Omega", "PSNR in dB"], rows)
        + "\nColored squares of 160 by 160 pixels, each with one channel near 0, as the dark "
        "channel prior expects, under haze made with the haze model: air light (0.85, 0.88, "
        "0.9) and t = exp(-1.6 depth), with depth 1 at the top and 0 at the bottom. The hazy "
        f"image has {fix(psnr(damaged, clear), 2)} dB against the scene. The filter found the "
        f"air light ({', '.join(fix(v, 2) for v in light)}), a little darker than the true one, "
        "since even the top row keeps 20 percent of the scene. The refined transmission ranges "
        f"from {fix(float(t.min()), 2)} to {fix(float(t.max()), 2)}, against 0.20 to 1.00 in "
        "the model. All rows use the other defaults.\n"
    )


def banded_ramp() -> tuple[NDArray[np.float64], Gray]:
    """A gentle ramp from 100 to 124 with a slow wave, and the same in steps of 4 levels."""
    y, x = np.mgrid[0:120, 0:160]
    smooth = 100 + x * 24 / 160 + 6 * np.sin(y / 30)
    return smooth, (np.round(smooth / 4) * 4).astype(np.uint8)


def stretched(gray: Gray, low: float, high: float) -> Gray:
    return to_8bit((gray.astype(np.float64) - low) * 255 / (high - low))


def deband_docs(out: dict[Path, str]) -> None:
    filter_id = "deband"
    smooth, banded = banded_ramp()
    result = run(deband, banded, filter_id, threshold=5)
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "A gentle ramp in steps of 4 levels and the result of debanding with a "
            "threshold of 5, both as they are and with the range 95 to 130 stretched to the "
            "full gray scale.",
            "panels": [
                {"title": "Banded", "image": picture(banded)},
                {"title": "Debanded", "image": picture(result)},
                {"title": "Banded, stretched", "image": picture(stretched(banded, 95, 130))},
                {"title": "Debanded, stretched", "image": picture(stretched(result, 95, 130))},
            ],
        },
        separators=(",", ":"),
    )

    def smoothness(gray: Gray) -> str:
        local = ndimage.uniform_filter(gray.astype(np.float64), 5)[16:-16, 16:-16]
        error = np.mean((local - smooth[16:-16, 16:-16]) ** 2)
        return fix(10 * math.log10(255**2 / error), 2)

    ranges = (8, 16, 32)
    rows = [
        [
            fix(t, 0),
            *(smoothness(run(deband, banded, filter_id, threshold=t, range=r)) for r in ranges),
        ]
        for t in (3, 5, 8)
    ]
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Threshold", *(f"Range {r}" for r in ranges)], rows)
        + "\nA ramp from 100 to 124 across 160 pixels, with a wave of 6 levels down the rows, "
        "rounded to steps of 4 levels, so each band is about 27 pixels wide. The numbers are "
        "the PSNR in dB between the 5 x 5 local mean of the result and the smooth ramp, away "
        "from the border. This measures how well the steps blend, while ignoring the fine grain "
        f"the filter adds. The banded ramp itself has {smoothness(banded)} dB. A threshold of "
        "3 is below the step of 4, so nothing changes. A range of 32 is longer than a band, so "
        "more references reach a band that differs by more than the threshold, and fewer "
        "pixels are replaced.\n"
    )


def halftone_scan(base: Gray, period: float = 6, angle: float = 45) -> tuple[Gray, Gray]:
    """A clustered-dot screen of the base, blurred as a scanner would, and the base with the
    same blur."""
    height, width = base.shape
    y, x = np.mgrid[0:height, 0:width]
    a = math.radians(angle)
    u = x * math.cos(a) + y * math.sin(a)
    v = -x * math.sin(a) + y * math.cos(a)
    screen = (np.cos(2 * np.pi * u / period) + np.cos(2 * np.pi * v / period)) / 4 + 0.5
    dots = np.where(base / 255 > screen, 255.0, 0.0)
    return (
        to_8bit(ndimage.gaussian_filter(dots, 1.2)),
        to_8bit(ndimage.gaussian_filter(base.astype(np.float64), 1.0)),
    )


def descreen_docs(out: dict[Path, str]) -> None:
    filter_id = "descreen"
    base = to_8bit(disks(160, 160).astype(np.float64) * 0.8 + 30)
    scan, _ = halftone_scan(base)

    def gaussian(gray: Gray) -> Gray:
        return to_8bit(ndimage.gaussian_filter(gray.astype(np.float64), 2))

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "A scanned halftone of disks, the result of descreening with the "
            "defaults, the pattern it removed, and a Gaussian blur of sigma 2 for comparison.",
            "panels": [
                {"title": "Scan", "image": picture(scan)},
                {"title": "Descreened", "image": picture(run(descreen, scan, filter_id))},
                {
                    "title": "Removed",
                    "image": picture(run(descreen, scan, filter_id, output="removed")),
                },
                {"title": "Gaussian, sigma 2", "image": picture(gaussian(scan))},
            ],
        },
        separators=(",", ":"),
    )
    rows = []
    for label, image in (
        ("Disks", disks(160, 160)),
        ("Siemens star", siemens_star(160, 160)),
    ):
        source = to_8bit(image.astype(np.float64) * 0.8 + 30)
        for period, angle in ((6, 45), (5, 15)):
            dirty, clean = halftone_scan(source, period, angle)
            rows.append(
                [
                    f"{label}, period {period}, {angle} degrees",
                    fix(psnr(dirty, clean), 2),
                    fix(psnr(run(descreen, dirty, filter_id), clean), 2),
                    fix(psnr(gaussian(dirty), clean), 2),
                ]
            )
    untouched = max(
        int(np.abs(run(descreen, image, filter_id).astype(int) - image.astype(int)).max())
        for image in (disks(160, 160), siemens_star(160, 160))
    )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Scan", "Scan", "Descreened", "Gaussian, sigma 2"], rows)
        + "\nThe PSNR in dB against the image under the scanner blur alone. Each scan is a "
        "clustered-dot screen of the image, with the period in pixels and the angle given, "
        "blurred with a Gaussian of sigma 1.2 as a scanner would. Both images are 160 by 160 "
        "pixels. By PSNR, descreening with the defaults stays a little behind a Gaussian blur of "
        "sigma 2 on three of the four scans. The dots of a binary screen also leave broadband "
        "noise, which no notch can remove, while the blur removes some of it. On the disks and "
        "the Siemens star without a screen, "
        + (
            "the filter changes no pixel at all"
            if untouched == 0
            else f"the filter changes no pixel by more than {untouched} levels"
        )
        + ", since their spectra hold lines and rings, not isolated peaks.\n"
    )


def jpeg_round_trip(image: NDArray[np.uint8], quality: int) -> NDArray[np.uint8]:
    """Pillow's JPEG encoder and decoder, without chroma subsampling."""
    buffer = io.BytesIO()
    mode = "RGB" if image.ndim == 3 else "L"
    Image.fromarray(image, mode).save(buffer, "JPEG", quality=quality, subsampling=0)
    decoded = Image.open(io.BytesIO(buffer.getvalue())).convert(mode)
    return np.asarray(decoded, dtype=np.uint8)


def jpeg_docs(out: dict[Path, str]) -> None:
    star = siemens_star(160, 160)
    scene = to_8bit(blocks_scene() * 255)
    qualities = (10, 20, 30, 50)
    for filter_id, function in (
        ("deblock", deblock),
        ("dering", dering),
        ("jpeg-cleanup", jpeg_cleanup),
    ):
        decoded = jpeg_round_trip(star, 20)
        values = {} if filter_id == "dering" else {"quality": 20}
        panels = [
            {"title": "JPEG, quality 20", "image": picture(decoded)},
            {
                "title": filter_id_title(filter_id),
                "image": picture(run(function, decoded, filter_id, **values)),
            },
        ]
        if filter_id == "dering":
            panels.append(
                {"title": "Zone", "image": picture(run(dering, decoded, filter_id, output="zone"))}
            )
        else:
            panels.append(
                {
                    "title": "One grid",
                    "image": picture(run(function, decoded, filter_id, quality=20, shifts="1")),
                }
            )
        panels.append({"title": "Original", "image": picture(star)})
        out[DATA / f"{filter_id}.json"] = json.dumps(
            {
                "filter": filter_id,
                "message": f"A Siemens star saved as JPEG with quality 20, the result of "
                f"{filter_id_title(filter_id).lower()} with the defaults, "
                + (
                    "the zone around strong edges, "
                    if filter_id == "dering"
                    else "the result with one grid only, "
                )
                + "and the original.",
                "panels": panels,
            },
            separators=(",", ":"),
        )
        rows = []
        for label, image in (("Siemens star", star), ("Colored squares", scene)):
            for quality in qualities:
                decoded = jpeg_round_trip(image, quality)
                runner = run_color if image.ndim == 3 else run
                row = [label, str(quality), fix(psnr(decoded, image), 2)]
                if filter_id != "dering":
                    row.append(
                        fix(
                            psnr(
                                runner(function, decoded, filter_id, quality=quality, shifts="2"),
                                image,
                            ),
                            2,
                        )
                    )
                    row.append(
                        fix(psnr(runner(function, decoded, filter_id, quality=quality), image), 2)
                    )
                else:
                    row.append(fix(psnr(runner(function, decoded, filter_id), image), 2))
                    row.append(
                        fix(psnr(runner(function, decoded, filter_id, sigmaColor=50), image), 2)
                    )
                rows.append(row)
        headers = (
            ["Image", "Quality", "JPEG", "Defaults", "Range sigma 50"]
            if filter_id == "dering"
            else ["Image", "Quality", "JPEG", "2 x 2 shifts", "8 x 8 shifts"]
        )
        note = (
            "The deringing columns use the defaults, and then a range sigma of 50."
            if filter_id == "dering"
            else "The filter is told the true quality of the file. The last two columns use 4 "
            "and 64 shifted grids. On the colored squares, whose sharp color edges repeat every "
            "20 pixels, 4 grids beat 64, and 64 grids even fall below the JPEG at low quality. "
            "Averaging many grids also blurs sharp edges, most of all in Cb and Cr, whose table "
            "is coarse."
        )
        out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
            header(filter_id)
            + md_table(headers, rows)
            + "\nThe PSNR in dB against the original, for images of 160 by 160 pixels saved "
            "with Pillow's JPEG encoder at each quality, without chroma subsampling, and "
            f"decoded again. {note} The colored squares are the scene of the dehazing example. "
            "The Siemens star has many strong edges, where ringing is worst.\n"
        )


# Inpainting and super-resolution ---------------------------------------------------------------

INPAINT_METHODS = [("telea", "Telea"), ("ns", "Navier-Stokes"), ("biharmonic", "Biharmonic")]


def scratch_hole(size: int = 160) -> NDArray[np.bool_]:
    """A scratch 5 pixels wide across the image, and a spot of radius 9."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float64)
    # Distance from the line through (0.15 size, 0.75 size) and (0.85 size, 0.3 size).
    x0, y0, x1, y1 = 0.15 * size, 0.75 * size, 0.85 * size, 0.3 * size
    length = math.hypot(x1 - x0, y1 - y0)
    distance = np.abs((x1 - x0) * (y0 - y) - (x0 - x) * (y1 - y0)) / length
    along = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / length
    scratch = (distance <= 2.5) & (along >= 0) & (along <= length)
    spot = (x - 0.3 * size) ** 2 + (y - 0.3 * size) ** 2 <= 9**2
    return np.asarray(scratch | spot)


def run_inpaint(gray: Gray, hole: NDArray[np.bool_], **values: Any) -> Gray:
    params = {**catalog_values("inpaint", **values), "mask": hole.astype(np.uint8) * 255}
    result = np.asarray(inpaint(rgba(gray), params, lambda _: None))
    return np.asarray(result[..., 0], dtype=np.uint8)


def inpaint_docs(out: dict[Path, str]) -> None:
    filter_id = "inpaint"
    star = siemens_star(160, 160, spokes=12)
    hole = scratch_hole()
    damaged = np.where(hole, 255, star).astype(np.uint8)
    panels = [
        {"title": "Damaged", "image": picture(damaged)},
        {"title": "Hole", "image": picture(np.where(hole, 255, 0).astype(np.uint8))},
        {"title": "Original", "image": picture(star)},
    ]
    panels += [
        {"title": label, "image": picture(run_inpaint(damaged, hole, method=method))}
        for method, label in INPAINT_METHODS
    ]
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "A Siemens star with 12 spokes, a white scratch and a white spot, the "
            "hole that covers them, the star before the damage, and the three methods with "
            "the other defaults.",
            "panels": panels,
        },
        separators=(",", ":"),
    )

    scenes = [("Disks", disks(160, 160)), ("Siemens star", star)]

    def in_hole(gray: Gray, clean: Gray) -> str:
        return fix(psnr(gray[hole], clean[hole]), 2)

    rows = [
        [label, *(in_hole(run_inpaint(clean, hole, method=method), clean) for _, clean in scenes)]
        for method, label in INPAINT_METHODS
    ]
    _, x = np.mgrid[0:160, 0:160]
    ramp = (40 + x).astype(np.uint8)
    ramp_error = {
        label: int(np.abs(run_inpaint(ramp, hole, method=m).astype(int) - ramp)[hole].max())
        for m, label in INPAINT_METHODS
    }
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Method", *(name for name, _ in scenes)], rows)
        + f"\nThe scratch and spot of the figure, {int(hole.sum())} pixels in all, on two "
        "160 x 160 test images. The numbers are the PSNR in dB inside the hole, against the "
        "image before the damage. On a ramp that rises by 1 level per pixel to the right, the "
        "largest error in the hole is "
        f"{ramp_error['Telea']} levels for Telea, {ramp_error['Navier-Stokes']} for "
        f"Navier-Stokes and {ramp_error['Biharmonic']} for biharmonic, since a plane is its own "
        "biharmonic fill.\n"
    )


def shrink(gray: NDArray[np.float64], scale: int) -> NDArray[np.float64]:
    """The camera model of the filter: the mean of each scale x scale block."""
    h, w = gray.shape[0] // scale, gray.shape[1] // scale
    blocks = gray[: h * scale, : w * scale].reshape(h, scale, w, scale)
    return np.asarray(blocks.mean(axis=(1, 3)))


def sr_classical_docs(out: dict[Path, str]) -> None:
    filter_id = "sr-classical"
    star = siemens_star(160, 160, spokes=12)
    small = to_8bit(shrink(star.astype(np.float64), 2))

    def enlarged(iterations: int, image: Gray = small, scale: int = 2) -> Gray:
        values = {"scale": scale, "iterations": iterations}
        params = catalog_values(filter_id, **values)
        result = np.asarray(sr_classical(rgba(image), params, lambda _: None))
        return np.asarray(result[..., 0], dtype=np.uint8)

    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "A Siemens star with 12 spokes, shrunk to half by block means and "
            "shown with each pixel copied, then enlarged again with bicubic (0 iterations) and "
            "with 10 iterations of back-projection.",
            "panels": [
                {"title": "Original", "image": picture(star)},
                {"title": "Shrunk", "image": picture(np.kron(small, np.ones((2, 2), np.uint8)))},
                {"title": "Bicubic", "image": picture(enlarged(0))},
                {"title": "Back-projection", "image": picture(enlarged(10))},
            ],
        },
        separators=(",", ":"),
    )

    rows = []
    for name, clean in (("Disks", disks(192, 192)), ("Siemens star", siemens_star(192, 192))):
        for scale in (2, 3, 4):
            low = to_8bit(shrink(clean.astype(np.float64), scale))
            cells = [fix(psnr(enlarged(k, low, scale), clean), 2) for k in (0, 3, 10)]
            rows.append([name, str(scale), *cells])
    g = small.astype(np.float64)
    grid = Grid(g.shape[0], g.shape[1], 2)
    residual = [
        fix(float(np.sqrt(np.mean((g - grid.down(sr_back_project(g, grid, k))) ** 2))), 4)
        for k in (0, 3, 10)
    ]
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Image", "Scale", "Bicubic", "3 iterations", "10 iterations"], rows)
        + "\nEach 192 x 192 test image is shrunk with the camera model of the filter, the mean "
        "of each block, and rounded to 8 bits. Then the filter enlarges it again. The numbers "
        "are the PSNR in dB against the image before shrinking. For the star at scale 2, the "
        "root mean square difference between the shrunk image and the camera model of the "
        f"estimate is {residual[0]} levels for bicubic, {residual[1]} after 3 iterations and "
        f"{residual[2]} after 10, before rounding.\n"
    )


# Ridge filters ----------------------------------------------------------------------------------

RIDGE_FILTERS = {
    "frangi": ("Frangi", frangi_filter),
    "hessian": ("Hybrid Hessian", hessian_filter),
    "sato": ("Sato", sato_filter),
    "meijering": ("Meijering", meijering_filter),
}
RIDGE_WIDTHS = (1, 2, 4, 8)


def ridge_scene() -> tuple[Gray, list[NDArray[np.bool_]], NDArray[np.bool_]]:
    """Four dark waves 1, 2, 4 and 8 pixels wide and a dark disk of radius 6 on a bright ground,
    with Gaussian noise of sigma 4. Also the center line of each wave and the disk center."""
    height, width = 160, 192
    y, x = np.mgrid[0:height, 0:width].astype(np.float64) + 0.5
    image = np.full((height, width), 200.0)
    centers = []
    for k, w in enumerate(RIDGE_WIDTHS):
        middle = 22 + 30 * k + 5 * np.sin(2 * np.pi * x / 96)
        image[np.abs(y - middle) <= w / 2] = 70
        centers.append(np.abs(y - middle) < 0.5)
    image[(x - 172) ** 2 + (y - 145) ** 2 <= 36] = 70
    blob = (np.abs(x - 172) < 1) & (np.abs(y - 145) < 1)
    return noisy(np.asarray(ndimage.gaussian_filter(image, 0.6)), 4, seed=11), centers, blob


def ridge_docs(out: dict[Path, str], filter_id: str) -> None:
    name, function = RIDGE_FILTERS[filter_id]
    scene, centers, blob = ridge_scene()
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "Four dark waves 1, 2, 4 and 8 pixels wide and a dark disk, with noise, "
            f"and the {name} filter with the defaults, with the scales 1 to 3 only, and "
            "looking for bright ridges.",
            "panels": [
                {"title": "Input", "image": picture(scene)},
                {"title": "Defaults", "image": picture(run(function, scene, filter_id))},
                {
                    "title": "Scales 1 to 3",
                    "image": picture(run(function, scene, filter_id, sigmaMax=3, sigmaStep=1)),
                },
                {
                    "title": "Bright ridges",
                    "image": picture(run(function, scene, filter_id, ridges="bright")),
                },
            ],
        },
        separators=(",", ":"),
    )

    def cells(result: Gray) -> list[str]:
        values = [f"{np.median(result[center]):.0f}" for center in centers]
        return [*values, f"{np.median(result[blob]):.0f}"]

    rows = [
        ["Defaults (1 to 9)", *cells(run(function, scene, filter_id))],
        ["Scales 1 to 3", *cells(run(function, scene, filter_id, sigmaMax=3, sigmaStep=1))],
        ["Scales 5 to 9", *cells(run(function, scene, filter_id, sigmaMin=5))],
    ]
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Scales", *(f"Width {w}" for w in RIDGE_WIDTHS), "Disk"], rows)
        + "\nThe image of the figure: four dark waves on a ground of 200, at 70 before a blur of "
        "sigma 0.6 and noise of sigma 4, and a dark disk of radius 6. The numbers are the "
        f"result of the {name} filter from 0 to 255, as the median along the middle of each "
        "wave and the value at the middle of the disk. Each result is stretched so its "
        "strongest response is 255.\n"
    )


# Blob detectors ---------------------------------------------------------------------------------

BLOB_FILTERS = {
    "blob-log": ("LoG blob detection", blob_log_filter),
    "blob-dog": ("DoG blob detection", blob_dog_filter),
    "blob-doh": ("Determinant of Hessian", blob_doh_filter),
}
# The disks of the Disks test image at 512 x 512: center x, center y and radius.
TEST_DISKS = [
    (96, 96, 48),
    (256, 96, 24),
    (384, 96, 12),
    (448, 96, 6),
    (128, 320, 72),
    (352, 320, 36),
]


def blob_rows(filter_id: str, gray: Gray, **values: Any) -> list[list[float]]:
    function = BLOB_FILTERS[filter_id][1]
    table = function(rgba(gray), catalog_values(filter_id, **values), lambda _: None)
    assert isinstance(table, dict)
    rows: list[list[float]] = table["rows"]
    return rows


def with_rings(gray: Gray, rows: list[list[float]]) -> Gray:
    """Draw a ring of each blob's radius around its center: white on dark pixels, black on light."""
    y, x = np.mgrid[0 : gray.shape[0], 0 : gray.shape[1]]
    out = gray.copy()
    for bx, by, radius, *_ in rows:
        ring = np.abs(np.hypot(x - bx, y - by) - max(radius, 2.0)) < 0.7
        out[ring] = np.where(gray[ring] < 128, 255, 0)
    return out


def blob_docs(out: dict[Path, str], filter_id: str) -> None:
    name = BLOB_FILTERS[filter_id][0]
    scene = disks(256, 256)
    rough = noisy(scene.astype(np.float64), 12, seed=5)
    panels = [
        {"title": "Input", "image": picture(scene)},
        {"title": "Defaults", "image": picture(with_rings(scene, blob_rows(filter_id, scene)))},
        {
            "title": "Smallest sigma 3",
            "image": picture(with_rings(scene, blob_rows(filter_id, scene, minSigma=3))),
        },
        {
            "title": "Noise of sigma 12",
            "image": picture(with_rings(rough, blob_rows(filter_id, rough))),
        },
    ]
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": f"The Disks test image at 256 x 256, and the blobs {name} finds with the "
            "defaults, with the smallest sigma at 3, and on a copy with Gaussian noise of sigma "
            "12. Each blob is drawn as a ring of its radius.",
            "panels": panels,
        },
        separators=(",", ":"),
    )

    full = disks(512, 512)
    rows = blob_rows(filter_id, full)
    cells = []
    matched = 0
    for cx, cy, radius in TEST_DISKS:
        near = sorted(rows, key=lambda r: math.hypot(r[0] - cx, r[1] - cy))
        best = near[0] if near else None
        if best is None or math.hypot(best[0] - cx, best[1] - cy) > radius / 2:
            cells.append([str(radius), "not found", "", ""])
            continue
        offset = math.hypot(best[0] - cx, best[1] - cy)
        matched += 1
        cells.append([str(radius), fix(best[2], 1), fix(offset, 1), fix(best[4], 4)])
    noisy_count = len(blob_rows(filter_id, noisy(full.astype(np.float64), 12, seed=5)))
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Disk radius (px)", "Found radius (px)", "Center off by (px)", "Score"], cells)
        + f"\nThe six disks of the Disks test image at 512 x 512, and the nearest blob that {name} "
        "finds with the defaults. A disk counts as not found when no blob lies within half "
        f"its radius. With the defaults it finds {len(rows)} blobs in all, and "
        f"{len(rows) - matched} of them are not at a disk: the four single bright pixels, or "
        f"false blobs. On a copy with Gaussian noise of sigma 12 it finds {noisy_count}.\n"
    )


# Keypoint detectors -----------------------------------------------------------------------------

KEYPOINT_FILTERS = {
    "sift": ("SIFT", sift),
    "orb": ("ORB", orb),
    "brisk": ("BRISK", brisk),
    "akaze": ("AKAZE", akaze),
    "surf-inspired": ("The SURF-inspired detector", surf_inspired),
}


def keypoint_rows(filter_id: str, gray: Gray, **values: Any) -> list[list[float]]:
    """Rows of x, y, radius, angle and score, whatever the order of the table's columns."""
    function = KEYPOINT_FILTERS[filter_id][1]
    table = function(rgba(gray), catalog_values(filter_id, **values), lambda _: None)
    assert isinstance(table, dict)
    keys = [column["key"] for column in table["columns"]]
    picks = [keys.index(key) for key in ("x", "y", "radius", "angle", "score")]
    return [[row[i] for i in picks] for row in table["rows"]]


def with_keypoints(gray: Gray, rows: list[list[float]]) -> Gray:
    """Draw each keypoint as a ring of its radius with a line from the center along its angle,
    white on dark pixels and black on light ones. Angles count counterclockwise, y points down."""
    y, x = np.mgrid[0 : gray.shape[0], 0 : gray.shape[1]]
    marks = np.zeros(gray.shape, dtype=bool)
    for kx, ky, radius, angle, *_ in rows:
        r = max(radius, 2.0)
        marks |= np.abs(np.hypot(x - kx, y - ky) - r) < 0.6
        theta = math.radians(angle)
        for t in np.linspace(0, r, max(2, int(2 * r))):
            px = round(kx + t * math.cos(theta))
            py = round(ky - t * math.sin(theta))
            if 0 <= px < gray.shape[1] and 0 <= py < gray.shape[0]:
                marks[py, px] = True
    out = gray.copy()
    out[marks] = np.where(gray[marks] < 128, 255, 0)
    return out


def turned_share(filter_id: str, gray: Gray) -> float:
    """The share of keypoints found again, at the turned place with the angle plus 90 degrees,
    after turning the image a quarter counterclockwise."""
    rows = keypoint_rows(filter_id, gray)
    turned = keypoint_rows(filter_id, np.ascontiguousarray(np.rot90(gray)))
    width = gray.shape[1]
    found = 0
    for x, y, radius, angle, *_ in rows:
        for tx, ty, tr, ta, *_ in turned:
            difference = (ta - angle - 90) % 360
            close = math.hypot(tx - y, ty - (width - 1 - x)) < 1 and abs(tr - radius) < 0.1 * radius
            if close and min(difference, 360 - difference) < 5:
                found += 1
                break
    return found / max(1, len(rows))


def keypoint_docs(out: dict[Path, str], filter_id: str) -> None:
    name = KEYPOINT_FILTERS[filter_id][0]
    star = siemens_star(256, 256)
    scene = disks(256, 256)
    turned = np.ascontiguousarray(np.rot90(star))
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": f"The keypoints {name} finds with the defaults on the Siemens star and "
            "the Disks test images at 256 x 256, and on the star turned a quarter "
            "counterclockwise. Each keypoint is a ring of its radius with a line along its "
            "angle.",
            "panels": [
                {"title": "Siemens star", "image": picture(star)},
                {
                    "title": "Keypoints",
                    "image": picture(with_keypoints(star, keypoint_rows(filter_id, star))),
                },
                {
                    "title": "Turned star",
                    "image": picture(with_keypoints(turned, keypoint_rows(filter_id, turned))),
                },
                {
                    "title": "Disks",
                    "image": picture(with_keypoints(scene, keypoint_rows(filter_id, scene))),
                },
            ],
        },
        separators=(",", ":"),
    )
    rows = []
    for title, image in (("Siemens star", siemens_star(512, 512)), ("Disks", disks(512, 512))):
        found = keypoint_rows(filter_id, image)
        radii = [row[2] for row in found]
        rows.append(
            [
                title,
                str(len(found)),
                f"{min(radii):.1f} to {max(radii):.1f}" if radii else "",
                f"{100 * turned_share(filter_id, image):.0f}",
            ]
        )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Image", "Keypoints", "Radius (px)", "Found after a quarter turn (%)"], rows)
        + f"\n{name} with the defaults on the 512 x 512 test images. The last column is the "
        "share of keypoints found again after the image is turned a quarter counterclockwise: "
        "within 1 pixel of the turned place, with a radius within 10 percent, and with an "
        "angle 90 degrees larger, within 5 degrees. A quarter turn moves pixels exactly onto "
        "pixels, so any loss comes from the detector itself.\n"
    )


# SUSAN corners and MSER regions -----------------------------------------------------------------


def table_rows(function: Any, filter_id: str, gray: Gray, **values: Any) -> list[dict[str, float]]:
    """The rows of a feature table as dicts by column key."""
    table = function(rgba(gray), catalog_values(filter_id, **values), lambda _: None)
    assert isinstance(table, dict)
    keys = [column["key"] for column in table["columns"]]
    return [dict(zip(keys, row, strict=True)) for row in table["rows"]]


def with_crosses(gray: Gray, rows: list[dict[str, float]]) -> Gray:
    """A small cross on each point, white on dark pixels and black on light ones."""
    out = gray.copy()
    for row in rows:
        x, y = round(row["x"]), round(row["y"])
        for dx, dy in [(d, 0) for d in range(-3, 4)] + [(0, d) for d in range(-3, 4)]:
            px, py = x + dx, y + dy
            if 0 <= px < gray.shape[1] and 0 <= py < gray.shape[0]:
                out[py, px] = 255 if gray[py, px] < 128 else 0
    return out


def blurred_scene(gray: Gray, sigma: float) -> Gray:
    return to_8bit(ndimage.gaussian_filter(gray.astype(np.float64), sigma))


def susan_docs(out: dict[Path, str]) -> None:
    filter_id = "susan-corner"
    rectangle = np.full((256, 256), 40, np.uint8)
    rectangle[60:200, 80:180] = 200
    star = siemens_star(256, 256, spokes=12)
    scene = disks(256, 256)
    panels = [
        {"title": title, "image": picture(with_crosses(g, table_rows(susan_corner, filter_id, g)))}
        for title, g in (("Rectangle", rectangle), ("Siemens star", star), ("Disks", scene))
    ]
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "The corners SUSAN finds with the defaults on a bright rectangle, a "
            "Siemens star with 12 spokes and the Disks image, all 256 x 256, each marked with a "
            "cross.",
            "panels": panels,
        },
        separators=(",", ":"),
    )
    rows = []
    for t in (10, 25, 40):
        cells = [
            str(len(table_rows(susan_corner, filter_id, g, brightness=t)))
            for g in (rectangle, star, scene)
        ]
        rows.append([fix(t, 0), *cells])
    edge = table_rows(susan_corner, filter_id, rectangle)
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Brightness threshold", "Rectangle", "Siemens star", "Disks"], rows)
        + "\nThe number of corners with the geometric threshold of 0.5 on the three images of "
        "the figure. The rectangle is 100 x 140 pixels at 200 on a ground of 40, so any "
        "threshold well below the step of 160 finds its four corners, at the corner pixels "
        f"themselves, with the response {edge[0]['score']:g} and a USAN area of "
        f"{edge[0]['usan']:g} of 37. The other corners on the star and the disks lie along "
        "the spokes and the round edges.\n"
    )


def with_regions(gray: Gray, rows: list[dict[str, float]]) -> Gray:
    """Each region as a ring of its equal-area radius with a line along its long axis."""
    y, x = np.mgrid[0 : gray.shape[0], 0 : gray.shape[1]]
    marks = np.zeros(gray.shape, dtype=bool)
    for row in rows:
        r = max(row["radius"], 2.0)
        marks |= np.abs(np.hypot(x - row["x"], y - row["y"]) - r) < 0.6
        theta = math.radians(row["angle"])
        for t in np.linspace(-r, r, max(2, int(4 * r))):
            px = round(row["x"] + t * math.cos(theta))
            py = round(row["y"] - t * math.sin(theta))
            if 0 <= px < gray.shape[1] and 0 <= py < gray.shape[0]:
                marks[py, px] = True
    out = gray.copy()
    out[marks] = np.where(gray[marks] < 128, 255, 0)
    return out


def mser_docs(out: dict[Path, str]) -> None:
    filter_id = "mser"
    scene = disks(256, 256)
    soft = blurred_scene(scene, 3)
    star = blurred_scene(siemens_star(256, 256, spokes=12), 3)
    panels = [
        {
            "title": "Disks",
            "image": picture(with_regions(scene, table_rows(mser, filter_id, scene))),
        },
        {
            "title": "Disks, blurred",
            "image": picture(with_regions(soft, table_rows(mser, filter_id, soft))),
        },
        {
            "title": "Star, blurred",
            "image": picture(with_regions(star, table_rows(mser, filter_id, star))),
        },
    ]
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {
            "filter": filter_id,
            "message": "The regions MSER finds with the defaults on the Disks image as it is, "
            "and on the Disks image and a Siemens star with 12 spokes after a Gaussian blur of "
            "sigma 3, all 256 x 256. Each region is a ring of the same area with a line along "
            "its long axis.",
            "panels": panels,
        },
        separators=(",", ":"),
    )
    full = disks(512, 512)
    rows = []
    for sigma in (0, 1, 2, 3, 5):
        g = full if sigma == 0 else blurred_scene(full, sigma)
        found = table_rows(mser, filter_id, g)
        areas = ", ".join(str(int(r["area"])) for r in found) or "none"
        rows.append([fix(sigma, 0), str(len(found)), areas])
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Blur sigma (px)", "Regions", "Areas (px)"], rows)
        + "\nThe Disks test image at 512 x 512 with the defaults, after a Gaussian blur of "
        "growing sigma, rounded to 8 bits. Its disks have areas of about 113 to 16300 pixels, "
        "and the largest area allowed is 14400. On the image as it is, OpenCV finds no region. "
        "After a blur it finds some, and how many depends on the blur.\n"
    )


# Texture ----------------------------------------------------------------------------------------

TEXTURE_PATCHES = ["Stripes", "Fine noise", "Coarse", "Flat"]


def texture_scene(size: int = 160) -> Gray:
    """Four textures in the quarters: vertical stripes with a period of 8 pixels, uniform noise
    from 60 to 196, Gaussian noise blurred with sigma 3, and 112 with noise of sigma 2."""
    half = size // 2
    rng = np.random.default_rng(11)
    out = np.empty((size, size))
    out[:half, :half] = 128 + 70 * np.sin(2 * np.pi * np.arange(half) / 8)[None, :]
    out[:half, half:] = rng.uniform(60, 196, (half, half))
    coarse = ndimage.gaussian_filter(rng.normal(0, 1, (half, half)), 3)
    out[half:, :half] = 128 + coarse / coarse.std() * 35
    out[half:, half:] = 112 + rng.normal(0, 2, (half, half))
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def texture_patches(scene: Gray) -> list[Gray]:
    half = scene.shape[0] // 2
    return [scene[:half, :half], scene[:half, half:], scene[half:, :half], scene[half:, half:]]


TEXTURE_MESSAGE = (
    "A test image of 160 x 160 with four textures: vertical stripes with a period of 8 pixels, "
    "fine uniform noise, coarse blurred noise, and a flat gray of 112 with faint noise of "
    "sigma 2."
)


def figure(out: dict[Path, str], filter_id: str, message: str, panels: list[Any]) -> None:
    out[DATA / f"{filter_id}.json"] = json.dumps(
        {"filter": filter_id, "message": message, "panels": panels}, separators=(",", ":")
    )


def lbp_docs(out: dict[Path, str]) -> None:
    scene = texture_scene()
    figure(
        out,
        "lbp",
        f"{TEXTURE_MESSAGE} Then the codes with 8 points at radius 1, by the default and the "
        "uniform method, and the variance method.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Default", "image": picture(run(lbp, scene, "lbp"))},
            {"title": "Uniform", "image": picture(run(lbp, scene, "lbp", method="uniform"))},
            {"title": "Variance", "image": picture(run(lbp, scene, "lbp", method="var"))},
        ],
    )
    rows = []
    for name, patch in zip(TEXTURE_PATCHES, texture_patches(scene), strict=True):
        default = table_rows(lbp, "lbp", patch, output="histogram")
        uniform = table_rows(lbp, "lbp", patch, output="histogram", method="uniform")
        top = max(uniform[:-1], key=lambda r: r["count"])
        rows.append(
            [
                name,
                str(sum(1 for r in default if r["count"] > 0)),
                f"{int(top['code'])} ({top['share']:.2f})",
                fix(uniform[-1]["share"], 2),
            ]
        )
    out[ROOT / "docs" / "_generated" / "examples" / "lbp.md"] = (
        header("lbp")
        + md_table(
            ["Quarter", "Default codes used", "Most common uniform label", "Non-uniform share"],
            rows,
        )
        + "\nEach quarter of the test image of the figure, 80 x 80, on its own, with 8 points at "
        "radius 1. The default method has 256 codes. The uniform method has the labels 0 to 8 by "
        "the number of 1s, and label 9 for all codes that are not uniform. The share is that of "
        "the pixels of the quarter.\n"
    )


def ltp_docs(out: dict[Path, str]) -> None:
    scene = texture_scene()
    figure(
        out,
        "ltp",
        f"{TEXTURE_MESSAGE} Then the upper code with the thresholds 0 and 5, and the lower code "
        "with the threshold 5.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Upper, t = 0", "image": picture(run(ltp, scene, "ltp", threshold=0))},
            {"title": "Upper, t = 5", "image": picture(run(ltp, scene, "ltp"))},
            {"title": "Lower, t = 5", "image": picture(run(ltp, scene, "ltp", output="lower"))},
        ],
    )
    thresholds = [0, 2, 5, 10]
    rows = []
    for name, patch in zip(TEXTURE_PATCHES, texture_patches(scene), strict=True):
        cells = []
        for t in thresholds:
            upper, lower = ltp_codes(patch, t, "reflect101")
            cells.append(fix(float(((upper == 0) & (lower == 0)).mean()), 2))
        rows.append([name, *cells])
    out[ROOT / "docs" / "_generated" / "examples" / "ltp.md"] = (
        header("ltp")
        + md_table(["Quarter", *(f"t = {t}" for t in thresholds)], rows)
        + "\nThe share of pixels whose upper and lower codes are both 0, so that no neighbor "
        "counts as brighter or darker. Each quarter of the test image of the figure, 80 x 80, on "
        "its own.\n"
    )


def glcm_docs(out: dict[Path, str]) -> None:
    scene = texture_scene()

    def mapped(prop: str) -> dict[str, Any]:
        return picture(run(glcm, scene, "glcm", output="map", property=prop))

    figure(
        out,
        "glcm",
        f"{TEXTURE_MESSAGE} Then three maps with the defaults: 8 levels, distance 1, angle 0 "
        "and a window of 15. Each map is stretched to the full gray range.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Contrast", "image": mapped("contrast")},
            {"title": "Homogeneity", "image": mapped("homogeneity")},
            {"title": "Correlation", "image": mapped("correlation")},
        ],
    )
    keys = ["contrast", "homogeneity", "energy", "correlation"]
    rows = []
    for name, patch in zip(TEXTURE_PATCHES, texture_patches(scene), strict=True):
        found = table_rows(glcm, "glcm", patch)
        for angle in (0, 90):
            row = next(r for r in found if r["angle"] == angle)
            rows.append([name, str(angle), *(fix(row[k], 3) for k in keys)])
    out[ROOT / "docs" / "_generated" / "examples" / "glcm.md"] = (
        header("glcm")
        + md_table(
            ["Quarter", "Angle (deg)", "Contrast", "Homogeneity", "Energy", "Correlation"], rows
        )
        + "\nThe table output with the defaults, 8 levels and distance 1, for each quarter of the "
        "test image of the figure, 80 x 80, on its own. The table lists four angles. Two are "
        "shown here.\n"
    )


def hog_docs(out: dict[Path, str]) -> None:
    star = siemens_star(128, 128, spokes=12)
    scene = texture_scene(128)
    figure(
        out,
        "hog",
        "A Siemens star with 12 spokes, 128 x 128, and its HOG view with cells of 8 and 16 "
        "pixels. Then the view of the texture test image at 128 x 128 with cells of 8 pixels. "
        "The other settings are the defaults.",
        [
            {"title": "Star", "image": picture(star)},
            {"title": "Cells of 8", "image": picture(run(hog_filter, star, "hog"))},
            {"title": "Cells of 16", "image": picture(run(hog_filter, star, "hog", cellSize=16))},
            {"title": "Textures, 8", "image": picture(run(hog_filter, scene, "hog"))},
        ],
    )
    big = siemens_star(256, 256)
    rows = []
    for cell in (8, 16, 32):
        for block in (2, 3):
            params = catalog_values("hog", cellSize=cell, blockSize=block)
            features, _ = hog_view(big, params)
            rows.append([str(cell), str(block), str((256 // cell) ** 2), str(features.size)])
    out[ROOT / "docs" / "_generated" / "examples" / "hog.md"] = (
        header("hog")
        + md_table(["Cell size (px)", "Block size", "Cells", "Descriptor length"], rows)
        + "\nThe Siemens star at 256 x 256 with 9 orientation bins. The descriptor has one "
        "histogram of 9 bins for each cell of each block, and blocks overlap by all but one "
        "cell, so most cells count in several blocks. The view is the same for both block "
        "sizes.\n"
    )


# Phase congruency -------------------------------------------------------------------------------


def phase_scene(size: int = 160) -> Gray:
    """Uneven light from 60 on the left to 190 on the right, a faint square of +20 and a strong
    square of +60, and a bright and a dark line 1 pixel wide."""
    x = np.arange(size)[None, :] * np.ones((size, 1))
    out = 60 + 130 * x / (size - 1)
    out[24:64, 20:60] += 20
    out[24:64, 100:140] += 60
    out[100:140, 50] += 50
    out[100:140, 110] -= 50
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def phase_congruency_docs(out: dict[Path, str]) -> None:
    filter_id = "phase-congruency"
    scene = phase_scene()

    def shown(**values: Any) -> dict[str, Any]:
        return picture(run(phase_congruency_filter, scene, filter_id, **values))

    figure(
        out,
        filter_id,
        "A test image of 160 x 160 with light that rises from left to right, a faint square "
        "(+20) and a strong square (+60), and a bright and a dark line. Then the edges, the "
        "corners and the feature type of phase congruency with the defaults.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Edges", "image": shown()},
            {"title": "Corners", "image": shown(output="corners")},
            {"title": "Feature type", "image": shown(output="type")},
        ],
    )
    rows = []
    for height in (10, 40, 160):
        step = np.full((64, 64), 40.0)
        step[:, 33:] = 40 + height
        step[:, 32] = 40 + height / 2
        noise = np.random.default_rng(3).normal(0, 2, step.shape)
        cells = []
        for gray, k in ((step, 2.0), (step + noise, 2.0), (step + noise, 5.0)):
            result = phase_congruency(gray, catalog_values(filter_id, k=k), lambda _: None)
            cells.append(fix(float(np.median(result["M"][:, 32])), 2))
        rows.append([str(height), *cells])
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Step height", "No noise", "Noise, k = 2", "Noise, k = 5"], rows)
        + "\nThe largest moment M at a vertical step on a ground of 40, as the median along the "
        "middle column of the step, which holds the mean of both sides. The image is 64 x 64 "
        "and not rounded. The noise is Gaussian with sigma 2. The other settings are the "
        "defaults.\n"
    )


# Hough transforms -------------------------------------------------------------------------------


def hough_scene(size: int = 160) -> Gray:
    """A bright triangle, a gray rectangle and a dashed line on a dark ground."""
    from skimage import draw

    # scikit-image has no type hints.
    untyped: Any = draw
    gray = np.full((size, size), 40.0)
    rows, cols = untyped.polygon([20, 90, 90], [30, 10, 80], gray.shape)
    gray[rows, cols] = 210
    gray[100:140, 90:150] = 140
    for t in np.linspace(0, 1, 400):
        x, y = 100 + 50 * t, 20 + 50 * t
        if (t * 50 * math.sqrt(2)) % 16 < 10:
            gray[round(y) - 1 : round(y) + 2, round(x) - 1 : round(x) + 2] = 180
    return gray.astype(np.uint8)


def hough_lines_docs(out: dict[Path, str]) -> None:
    filter_id = "hough-lines"
    scene = hough_scene()
    figure(
        out,
        filter_id,
        "A test image of 160 x 160 with a triangle, a rectangle and a dashed line. Then the "
        "lines found with the defaults in white over the Canny edges in gray, the accumulator, "
        "and the three strongest lines only.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Lines", "image": picture(run(hough_lines, scene, filter_id))},
            {
                "title": "Accumulator",
                "image": picture(run(hough_lines, scene, filter_id, output="accumulator")),
            },
            {
                "title": "Three lines",
                "image": picture(run(hough_lines, scene, filter_id, lines=3)),
            },
        ],
    )
    found = table_rows(hough_lines, filter_id, scene, output="table")
    rows = [[fix(r["angle"], 0), fix(r["distance"], 0), str(int(r["votes"]))] for r in found]
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Direction (deg)", "Distance (px)", "Votes"], rows)
        + "\nThe table output with the defaults on the test image of the figure. The direction "
        "counts counterclockwise from the x axis. The distance is that of the line from the "
        "center of the top-left pixel.\n"
    )


def hough_circles_docs(out: dict[Path, str]) -> None:
    filter_id = "hough-circles"
    scene = disks(256, 256)
    hidden = scene.copy()
    hidden[125:150, :] = scene[0, 0]
    rough = noisy(scene.astype(np.float64), 12, seed=5)
    values = {"minRadius": 3, "maxRadius": 40}

    def ringed(gray: Gray, **extra: Any) -> dict[str, Any]:
        params = catalog_values(filter_id, **values, **extra)
        rows = circle_rows(edges(rgba(gray), params), params)
        return picture(with_rings(gray, rows))

    figure(
        out,
        filter_id,
        "The Disks test image at 256 x 256 with the circles found for radii from 3 to 40, each "
        "drawn as a ring. Then the accumulator, the circles with a share threshold of 0.3 when a "
        "band hides the tops of the two lower disks, and the circles with noise of sigma 12.",
        [
            {"title": "Disks", "image": ringed(scene)},
            {
                "title": "Accumulator",
                "image": picture(
                    run(hough_circles, scene, filter_id, output="accumulator", **values)
                ),
            },
            {"title": "Hidden, threshold 0.3", "image": ringed(hidden, threshold=0.3)},
            {"title": "Noise of sigma 12", "image": ringed(rough)},
        ],
    )
    rows = []
    cases: list[tuple[str, Gray, float]] = [
        ("Clean", scene, 0.5),
        ("Partly hidden", hidden, 0.5),
        ("Partly hidden, threshold 0.3", hidden, 0.3),
        ("Noise", rough, 0.5),
    ]
    for title, gray, threshold in cases:
        params = catalog_values(filter_id, **values, threshold=threshold)
        found = circle_rows(edges(rgba(gray), params), params)
        for x, y, radius in TEST_DISKS_256:
            near = [r for r in found if abs(r[0] + 0.5 - x) <= 2 and abs(r[1] + 0.5 - y) <= 2]
            cell = f"{near[0][2]} ({near[0][3]:.2f})" if near else "not found"
            rows.append([title, f"({x}, {y})", str(radius), cell])
        extra = len(found) - sum(
            1
            for r in found
            if any(
                abs(r[0] + 0.5 - x) <= 2 and abs(r[1] + 0.5 - y) <= 2 for x, y, _ in TEST_DISKS_256
            )
        )
        rows.append([title, "elsewhere", "", f"{extra} circles"])
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Image", "Disk center", "Radius (px)", "Found radius (share)"], rows)
        + "\nThe images of the figure with radii from 3 to 40 and the other defaults, unless a "
        "threshold is named. A disk "
        "counts as found when a circle has its center within 2 pixels of the disk center. The "
        "share is the part of the circle that lies on edges.\n"
    )


TEST_DISKS_256 = [
    (48, 48, 24),
    (128, 48, 12),
    (192, 48, 6),
    (224, 48, 3),
    (64, 160, 36),
    (176, 160, 18),
]


def hough_linking_docs(out: dict[Path, str]) -> None:
    filter_id = "hough-linking"
    scene = hough_scene()
    figure(
        out,
        filter_id,
        "The test image of 160 x 160 with a triangle, a rectangle and a dashed line. Then the "
        "segments in white over the Canny edges in gray with the defaults, with the shortest "
        "segment 20, and with the shortest segment 20 and the largest gap 0.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Defaults", "image": picture(run(hough_linking, scene, filter_id))},
            {
                "title": "Shortest 20",
                "image": picture(run(hough_linking, scene, filter_id, minLength=20)),
            },
            {
                "title": "Shortest 20, gap 0",
                "image": picture(run(hough_linking, scene, filter_id, minLength=20, maxGap=0)),
            },
        ],
    )
    params = catalog_values(filter_id)
    found = edges(rgba(scene), params)
    rows = []
    for length in (50, 20):
        for gap in (0, 3, 10):
            segments = segment_rows(found, catalog_values(filter_id, minLength=length, maxGap=gap))
            total = sum(r[4] for r in segments)
            rows.append([str(length), str(gap), str(len(segments)), fix(total, 0)])
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(
            ["Shortest segment (px)", "Largest gap (px)", "Segments", "Total length (px)"], rows
        )
        + f"\nThe test image of the figure has {int(found.sum())} edge pixels with the default "
        "Canny settings. The total length adds up the lengths of all segments. The dashes of "
        "the dashed line are 10 pixels long with gaps of about 6.\n"
    )


# Matched filter ---------------------------------------------------------------------------------

MATCH_OBJECTS = [
    ("Template", (30, 30)),
    ("Faint copy", (30, 90)),
    ("Inverted copy", (90, 30)),
    ("Full copy", (130, 120)),
]


def match_scene(noise: float = 0) -> Gray:
    """A cross of 220 on 60, a faint copy (140 on 100), an inverted copy, a bright block and a
    full copy, on a ground of 100, with Gaussian noise."""
    gray = np.full((160, 160), 100.0)
    looks = [(220, 60), (140, 100), (60, 220), (220, 60)]
    for (_, (cy, cx)), (fg, bg) in zip(MATCH_OBJECTS, looks, strict=True):
        if (cy, cx) == (130, 120):
            gray[70:110, 70:150] = 250
        gray[cy - 10 : cy + 11, cx - 10 : cx + 11] = bg
        gray[cy - 8 : cy + 9, cx - 2 : cx + 3] = fg
        gray[cy - 2 : cy + 3, cx - 8 : cx + 9] = fg
    if noise:
        gray += np.random.default_rng(4).normal(0, noise, gray.shape)
    return np.clip(np.rint(gray), 0, 255).astype(np.uint8)


def match_selection(shape: tuple[int, ...]) -> NDArray[np.uint8]:
    mask = np.zeros(shape[:2], np.uint8)
    mask[20:41, 20:41] = 255
    return mask


def run_matched(gray: Gray, **values: Any) -> Any:
    params = {**catalog_values("matched-filter", **values), "mask": match_selection(gray.shape)}
    return matched_filter(rgba(gray), params, lambda _: None)


def with_box(gray: Gray, top: int, left: int, height: int, width: int) -> Gray:
    """The outline of a rectangle, white on dark pixels and black on light ones."""
    out = gray.copy()
    edge = np.zeros(gray.shape, bool)
    edge[top, left : left + width] = edge[top + height - 1, left : left + width] = True
    edge[top : top + height, left] = edge[top : top + height, left + width - 1] = True
    out[edge] = np.where(gray[edge] < 128, 255, 0)
    return out


def matched_filter_docs(out: dict[Path, str]) -> None:
    filter_id = "matched-filter"
    scene = match_scene(8)
    matches = run_matched(scene, output="matches")
    rings = [[r[0], r[1], r[2]] for r in matches["rows"]]
    figure(
        out,
        filter_id,
        "A test image of 160 x 160 with a cross, a faint copy, an inverted copy, a bright block "
        "and a full copy, with noise of sigma 8. The selection is the 21 x 21 square around the "
        "first cross. Then the normalized cross-correlation, the plain matched filter, and the "
        "matches with the defaults, each drawn as a ring.",
        [
            {"title": "Input", "image": picture(with_box(scene, 19, 19, 23, 23))},
            {"title": "Normalized", "image": picture(run_matched(scene)[..., 0])},
            {"title": "Plain", "image": picture(run_matched(scene, output="correlation")[..., 0])},
            {"title": "Matches", "image": picture(with_rings(scene, rings))},
        ],
    )
    rows = []
    for noise in (0, 8):
        gray = match_scene(noise)
        plane = gray.astype(np.float64)
        template = plane[20:41, 20:41]
        scores = ncc_map(plane, template, "reflect101")
        plain = correlation_map(plane, template, "reflect101")
        reference = plain[30, 30]
        for name, (cy, cx) in MATCH_OBJECTS:
            rows.append(
                [
                    str(noise),
                    name,
                    fix(float(scores[cy, cx]), 3),
                    fix(float(plain[cy, cx] / reference), 2),
                ]
            )
        corner = plain[60:120, 60:160]
        rows.append(
            [
                str(noise),
                "Bright block, best",
                fix(float(scores[60:120, 60:160].max()), 3),
                fix(float(corner.max() / reference), 2),
            ]
        )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Noise sigma", "Place", "Normalized", "Plain, relative"], rows)
        + "\nThe test image of the figure, with the template cut from the first cross. The "
        "normalized value and the plain value are taken at the center of each object. The "
        "plain value is divided by its value at the template itself. For the bright block, the "
        "row gives the largest values anywhere on it or near it.\n"
    )


# Segmentation -----------------------------------------------------------------------------------


def label_colors(labels: NDArray[np.int64]) -> Color:
    """Regions in the studio's label colors, golden-angle hues with saturation 0.65 and value
    0.95, with boundary pixels at half brightness. Label 0 is black."""
    import colorsys

    count = int(labels.max(initial=0))
    table = np.zeros((count + 1, 3))
    for k in range(1, count + 1):
        table[k] = colorsys.hsv_to_rgb(((k * 137.507764) % 360) / 360, 0.65, 0.95)
    rgb = table[labels] * 255
    edge = np.zeros(labels.shape, bool)
    edge[:, :-1] |= labels[:, :-1] != labels[:, 1:]
    edge[:-1, :] |= labels[:-1, :] != labels[1:, :]
    rgb[edge] *= 0.5
    return to_8bit(rgb)


def segmentation_scene() -> Color:
    """The colored blocks with red disks, with Gaussian noise of sigma 6 on each channel."""
    noise = np.random.default_rng(9).normal(0, 6, (160, 160, 3))
    return to_8bit(blocks_scene() * 255 + noise)


SEGMENTERS: dict[str, tuple[str, Callable[..., Any], Callable[..., Any]]] = {
    "slic": ("SLIC", slic_filter, slic_labels),
    "felzenszwalb": ("Felzenszwalb", felzenszwalb_filter, felzenszwalb_labels),
    "quickshift": ("Quickshift", quickshift_filter, quickshift_labels),
    "mean-shift": (
        "mean shift",
        mean_shift,
        lambda image, params: similar_color_labels(
            mean_shift_colors(image, params), params["colorTolerance"]
        ),
    ),
    "split-merge": (
        "split-and-merge",
        split_merge,
        lambda image, params: merge_regions(
            split_luma(image),
            split_blocks(split_luma(image), params["threshold"], params["smallest"]),
            params["threshold"],
        ),
    ),
}
SWEEPS: dict[str, tuple[list[str], list[dict[str, Any]]]] = {
    "slic": (
        ["Superpixels asked", "Compactness"],
        [{"segments": n, "compactness": m} for n in (25, 100, 400) for m in (1, 10, 100)],
    ),
    "felzenszwalb": (
        ["Scale", "Smallest region (px)"],
        [{"scale": k, "minSize": m} for k in (1, 10, 100, 1000) for m in (20, 100)],
    ),
    "quickshift": (
        ["Kernel size", "Longest link"],
        [{"kernelSize": k, "maxDist": d} for k in (3, 5, 8) for d in (5, 10, 20)],
    ),
    "mean-shift": (
        ["Spatial radius (px)", "Color radius", "Color tolerance"],
        [
            {"spatialRadius": r, "colorRadius": c, "colorTolerance": t}
            for r, c in ((5, 20), (10, 20), (10, 40))
            for t in (0, 2, 6)
        ],
    ),
    "split-merge": (
        ["Threshold", "Smallest block (px)"],
        [{"threshold": t, "smallest": m} for t in (20, 30, 60) for m in (1, 4)],
    ),
}


def segmenter_docs(out: dict[Path, str], filter_id: str) -> None:
    name, function, labels_of = SEGMENTERS[filter_id]
    scene = segmentation_scene()
    image = rgba_color(scene)
    labels = labels_of(image, catalog_values(filter_id))
    figure(
        out,
        filter_id,
        "A test image of 160 x 160 with colored squares of 20 pixels and red disks, with noise of "
        f"sigma 6. Then the regions of {name} with the defaults in their label colors, with "
        "boundaries darker, the boundaries in yellow over the image, and each region filled "
        "with its mean color.",
        [
            {"title": "Input", "image": color_picture(scene)},
            {"title": "Regions", "image": color_picture(label_colors(labels))},
            {
                "title": "Boundaries",
                "image": color_picture(run_color(function, scene, filter_id, output="boundaries")),
            },
            {
                "title": "Mean colors",
                "image": color_picture(run_color(function, scene, filter_id, output="mean")),
            },
        ],
    )
    headers, sweep = SWEEPS[filter_id]
    rows = []
    for values in sweep:
        found = labels_of(image, catalog_values(filter_id, **values))
        count = int(found.max())
        rows.append([*(f"{v:g}" for v in values.values()), str(count), fix(found.size / count, 0)])
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table([*headers, "Regions", "Mean area (px)"], rows)
        + "\nThe test image of the figure, 160 x 160 pixels, with the other settings at their "
        "defaults. The colored squares alone would give 64 regions, and the disks cut some of "
        "them.\n"
    )


def otsu_scene() -> Gray:
    """A dark ground of 40 with a ramp, gray squares of 120 and bright disks of 210, blurred
    with sigma 1, with noise of sigma 8."""
    gray = np.full((160, 160), 40.0) + np.linspace(0, 20, 160)[None, :]
    gray[20:70, 90:150] = 120
    gray[100:150, 10:70] = 120
    gray[disks(160, 160) > 128] = 210
    gray = ndimage.gaussian_filter(gray, 1)
    return noisy(gray, 8, seed=2)


def multi_otsu_docs(out: dict[Path, str]) -> None:
    filter_id = "multi-otsu"
    scene = otsu_scene()
    labels = multi_otsu_labels(rgba(scene), catalog_values(filter_id))
    figure(
        out,
        filter_id,
        "A test image of 160 x 160 with a dark ground that brightens to the right, gray squares "
        "and bright disks, slightly blurred, with noise of sigma 8. Then the 3 classes in their "
        "label colors, as gray levels, and as boundaries in yellow over the image.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Classes", "image": color_picture(label_colors(labels))},
            {
                "title": "Gray levels",
                "image": picture(run(multi_otsu, scene, filter_id, output="levels")),
            },
            {
                "title": "Boundaries",
                "image": color_picture(
                    run_color(multi_otsu, np.dstack([scene] * 3), filter_id, output="boundaries")
                ),
            },
        ],
    )
    rows = []
    for classes in (2, 3, 4, 5):
        thresholds = multi_otsu_thresholds(rgba(scene), classes)
        found = multi_otsu_labels(rgba(scene), catalog_values(filter_id, classes=classes))
        shares = np.bincount(found.ravel(), minlength=classes + 1)[1:] / found.size
        rows.append(
            [
                str(classes),
                ", ".join(str(int(t)) for t in thresholds),
                ", ".join(fix(float(v), 2) for v in shares),
            ]
        )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Classes", "Thresholds", "Share of pixels per class"], rows)
        + "\nThe test image of the figure. The image was made with three levels, about 40 to "
        "60, 120 and 210, before the blur and the noise.\n"
    )


def noisy_disks() -> Gray:
    noise = np.random.default_rng(1).normal(0, 8, (256, 256))
    return np.clip(np.rint(disks(256, 256) + noise), 0, 255).astype(np.uint8)


def watershed_docs(out: dict[Path, str]) -> None:
    filter_id = "watershed"
    scene = noisy_disks()

    def regions(**values: Any) -> dict[str, Any]:
        return color_picture(
            label_colors(watershed_labels(rgba(scene), catalog_values(filter_id, **values)))
        )

    figure(
        out,
        filter_id,
        "The Disks test image at 256 x 256 with noise of sigma 8. Then the elevation, the Sobel "
        "gradient after a blur of sigma 1, and the regions in their label colors with the "
        "depth h at 2 and at 20.",
        [
            {"title": "Input", "image": picture(scene)},
            {
                "title": "Elevation",
                "image": picture(run(watershed_filter, scene, filter_id, output="elevation")),
            },
            {"title": "h = 2", "image": regions(h=2)},
            {"title": "h = 20", "image": regions(h=20)},
        ],
    )
    rows = []
    for h in (2, 5, 10, 20, 40):
        for sigma in (0, 1):
            found = watershed_labels(rgba(scene), catalog_values(filter_id, h=h, sigma=sigma))
            rows.append([f"{h:g}", f"{sigma:g}", str(int(found.max()))])
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Depth h", "Smoothing sigma", "Regions"], rows)
        + "\nThe image of the figure, with six disks on a ground, so 7 regions would be "
        f"ideal. Its elevation reaches {elevation(rgba(scene), 1).max():.0f} on the disk "
        "edges after the default blur.\n"
    )


def touching_disks() -> Gray:
    rows, cols = np.mgrid[0:160, 0:160]
    gray = np.full((160, 160), 50.0)
    gray[np.hypot(rows - 80, cols - 58) < 34] = 190
    gray[np.hypot(rows - 80, cols - 104) < 30] = 160
    gray = ndimage.gaussian_filter(gray, 1.5)
    return noisy(gray, 6, seed=3)


def touching_markers() -> NDArray[np.uint8]:
    mask = np.zeros((160, 160), np.uint8)
    mask[75:86, 50:61] = 255
    mask[75:86, 100:111] = 255
    return mask


def marker_watershed_docs(out: dict[Path, str]) -> None:
    filter_id = "marker-watershed"
    scene = touching_disks()
    mask = touching_markers()

    def labels(**values: Any) -> NDArray[np.int64]:
        params = {**catalog_values(filter_id, **values), "mask": mask}
        return marker_watershed_labels(rgba(scene), params)

    marked = with_box(with_box(scene, 75, 50, 11, 11), 75, 100, 11, 11)
    params = {**catalog_values(filter_id, output="boundaries"), "mask": mask}
    drawn = marker_watershed(rgba(scene), params, lambda _: None)
    assert isinstance(drawn, np.ndarray)
    figure(
        out,
        filter_id,
        "Two touching disks of 190 and 160 on a ground of 50, slightly blurred, with noise of "
        "sigma 6, and two square markers selected inside them. Then the regions in their label "
        "colors with the border marker, the boundaries in yellow, and the regions without the "
        "border marker.",
        [
            {"title": "Input and markers", "image": picture(marked)},
            {"title": "Regions", "image": color_picture(label_colors(labels()))},
            {
                "title": "Boundaries",
                "image": color_picture(np.asarray(drawn[..., :3], np.uint8)),
            },
            {
                "title": "No border marker",
                "image": color_picture(label_colors(labels(borderMarker=False))),
            },
        ],
    )
    rows, cols = np.mgrid[0:160, 0:160]
    truth = [np.hypot(rows - 80, cols - 58) < 34, np.hypot(rows - 80, cols - 104) < 30]
    truth[1] &= ~truth[0]
    table = []
    for border in (True, False):
        found = labels(borderMarker=border)
        for name, k, inside in (("Left disk", 1, truth[0]), ("Right disk", 2, truth[1])):
            region = found == k
            overlap = float((region & inside).sum() / (region | inside).sum())
            table.append(
                [
                    "on" if border else "off",
                    name,
                    str(int(region.sum())),
                    str(int(inside.sum())),
                    fix(overlap, 3),
                ]
            )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Border marker", "Region", "Area (px)", "Disk area (px)", "Overlap"], table)
        + "\nThe image of the figure, with the defaults. The disk area counts the pixels "
        "within the radius of each disk, where the right disk gives way to the left one. The "
        "overlap is the area of both together divided by the area of either.\n"
    )


# Contours ---------------------------------------------------------------------------------------


def contour_truth() -> tuple[NDArray[np.bool_], NDArray[np.bool_]]:
    """A disk of radius 28 and a square of side 44, side by side in a 160 x 160 image."""
    rows, cols = np.mgrid[0:160, 0:160]
    round_part = np.hypot(rows - 80, cols - 52) <= 28
    square = np.zeros((160, 160), bool)
    square[58:102, 98:142] = True
    return round_part, square


def contour_scene(noise: float = 10) -> Gray:
    round_part, square = contour_truth()
    gray = np.full((160, 160), 50.0)
    gray[round_part] = 190
    gray[square] = 160
    return noisy(np.asarray(ndimage.gaussian_filter(gray, 1.5)), noise, seed=5)


def box_selection(top: int, left: int, height: int, width: int) -> NDArray[np.uint8]:
    mask = np.zeros((160, 160), np.uint8)
    mask[top : top + height, left : left + width] = 255
    return mask


def iou(found: NDArray[np.bool_], truth: NDArray[np.bool_]) -> float:
    return float((found & truth).sum() / (found | truth).sum())


def parts(found: NDArray[np.bool_]) -> int:
    return int(ndimage.label(found, structure=np.ones((3, 3), bool))[1])


def shown(result: Any) -> dict[str, Any]:
    assert isinstance(result, np.ndarray)
    return color_picture(np.asarray(result[..., :3], np.uint8))


def chan_vese_docs(out: dict[Path, str]) -> None:
    filter_id = "chan-vese"
    round_part, square = contour_truth()
    truth = round_part | square
    scene = contour_scene(30)

    def phases(gray: Gray, **values: Any) -> NDArray[np.int64]:
        phi = chan_vese_level_set(rgba(gray), catalog_values(filter_id, **values))
        return np.where(phi > 0, 1, 2).astype(np.int64)

    figure(
        out,
        filter_id,
        "A disk of 190 and a square of 160 on a ground of 50, slightly blurred, with noise of "
        "sigma 30. Then the two phases in their label colors, each phase filled with its mean "
        "color, and the final level set with 0 at middle gray.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Phases", "image": color_picture(label_colors(phases(scene)))},
            {
                "title": "Mean colors",
                "image": shown(
                    chan_vese_filter(
                        rgba(scene), catalog_values(filter_id, output="mean"), lambda _: None
                    )
                ),
            },
            {
                "title": "Level set",
                "image": picture(run(chan_vese_filter, scene, filter_id, output="levelSet")),
            },
        ],
    )
    rows = []
    for noise in (10, 30):
        gray = contour_scene(noise)
        for mu, tolerance in ((0, 0.001), (0.1, 0.001), (0.25, 0.001), (1, 0.001), (1, 0.0001)):
            inside = phases(gray, mu=mu, tolerance=tolerance) == 1
            rows.append(
                [
                    f"{noise:g}",
                    f"{mu:g}",
                    f"{tolerance:g}",
                    str(parts(inside)),
                    fix(iou(inside, truth), 3),
                ]
            )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(
            ["Noise sigma", "Length weight mu", "Tolerance", "Parts of phase 1", "Overlap"], rows
        )
        + "\nThe image of the figure, with two objects, and the other defaults. Phase 1 should be "
        "the disk and the square, 2 parts. The parts are 8-connected. The overlap is the area of "
        "phase 1 and both objects together divided by the area of either.\n"
    )


def level_set_docs(out: dict[Path, str]) -> None:
    filter_id = "level-set"
    round_part, square = contour_truth()
    truth = round_part | square
    scene = contour_scene()
    box = box_selection(20, 12, 120, 140)
    spots = box_selection(76, 48, 9, 9) | box_selection(76, 116, 9, 9)

    def inside(mask: NDArray[np.uint8], **values: Any) -> NDArray[np.bool_]:
        return level_set_inside(rgba(scene), {**catalog_values(filter_id, **values), "mask": mask})

    def boundaries(mask: NDArray[np.uint8], **values: Any) -> dict[str, Any]:
        params = {**catalog_values(filter_id, output="boundaries", **values), "mask": mask}
        return shown(level_set(rgba(scene), params, lambda _: None))

    figure(
        out,
        filter_id,
        "A disk and a square with noise of sigma 10, and a box selected around both. Then the "
        "edge stopping image, the contour shrunk from the box, and the contour grown with a "
        "balloon force of 1 from a small square selected inside each object.",
        [
            {"title": "Input and box", "image": picture(with_box(scene, 20, 12, 120, 140))},
            {
                "title": "Edge stopping",
                "image": picture(run(level_set, scene, filter_id, output="edgeStopping")),
            },
            {"title": "Shrunk from the box", "image": boundaries(box)},
            {"title": "Grown from spots", "image": boundaries(spots, balloon=1)},
        ],
    )
    rows = []
    runs = [(iterations, 1) for iterations in (10, 25, 50, 100, 200)] + [(100, 2)]
    for iterations, smoothing in runs:
        for name, mask, balloon in (("Box, shrink", box, -1), ("Spots, grow", spots, 1)):
            found = inside(mask, iterations=iterations, balloon=balloon, smoothing=smoothing)
            rows.append(
                [
                    name,
                    str(iterations),
                    str(smoothing),
                    str(parts(found)),
                    fix(iou(found, truth), 3),
                ]
            )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Start", "Iterations", "Smoothing", "Parts", "Overlap"], rows)
        + "\nThe image and selections of the figure, with the other defaults. The disk and the "
        "square are 2 parts. The overlap is the area of the inside and both objects together "
        "divided by the area of either.\n"
    )


def active_contour_docs(out: dict[Path, str]) -> None:
    from skimage import draw

    # scikit-image has no type hints.
    untyped: Any = draw
    filter_id = "active-contour"
    round_part, _ = contour_truth()
    scene = contour_scene()
    both = box_selection(20, 12, 120, 140)
    near = box_selection(40, 14, 80, 78)

    def contour(mask: NDArray[np.uint8], **values: Any) -> dict[str, Any]:
        params = {**catalog_values(filter_id, output="contour", **values), "mask": mask}
        return shown(active_contour_filter(rgba(scene), params, lambda _: None))

    figure(
        out,
        filter_id,
        "A disk and a square with noise of sigma 10. Then the snake from a box around both "
        "objects, from a box around the disk, and from the same box with a rigidity of 10. Each "
        "shows the start in blue and the end in yellow.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Around both", "image": contour(both)},
            {"title": "Around the disk", "image": contour(near)},
            {"title": "Rigidity 10", "image": contour(near, beta=10)},
        ],
    )
    rows = []
    for alpha in (0.01, 0.05, 0.1):
        for beta in (0.1, 10):
            params = {**catalog_values(filter_id, alpha=alpha, beta=beta), "mask": near}
            _, end = snake_result(rgba(scene), params)
            radius = np.hypot(end[:, 0] - 80, end[:, 1] - 52)
            found = np.zeros((160, 160), bool)
            rr, cc = untyped.polygon(end[:, 0], end[:, 1], shape=(160, 160))
            found[rr, cc] = True
            rows.append(
                [
                    f"{alpha:g}",
                    f"{beta:g}",
                    fix(float(radius.mean()), 1),
                    fix(float(radius.std()), 2),
                    fix(iou(found, round_part), 3),
                ]
            )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(
            ["Elasticity alpha", "Rigidity beta", "Mean radius (px)", "Spread (px)", "Overlap"],
            rows,
        )
        + "\nThe image of the figure, from the box around the disk, with the other defaults. "
        "The disk has a radius of 28 pixels. The mean radius and its spread, the standard "
        "deviation, are the distances of the final points from the center of the disk. The "
        "overlap is the area of the inside and the disk together divided by the area of either.\n"
    )


# Segmentation from seeds ------------------------------------------------------------------------


def seed_map() -> NDArray[np.uint8]:
    """Unknown at 128, an object seed in the disk, background seeds on the image edge and in the
    square."""
    mask = np.full((160, 160), 128, np.uint8)
    mask[76:85, 48:57] = 255
    mask[[0, -1], :] = 0
    mask[:, [0, -1]] = 0
    mask[76:85, 116:125] = 0
    return mask


def with_seed_boxes(gray: Gray, square_too: bool) -> Gray:
    out = with_box(gray, 76, 48, 9, 9)
    return with_box(out, 76, 116, 9, 9) if square_too else out


def seeded_docs(out: dict[Path, str], filter_id: str) -> None:
    round_part, square = contour_truth()
    scene = contour_scene()
    spot = box_selection(76, 48, 9, 9)
    function = graph_cut if filter_id == "graph-cut" else random_walker_filter

    def object_of(mask: NDArray[np.uint8], **values: Any) -> NDArray[np.bool_]:
        if filter_id == "graph-cut":
            params = {**catalog_values(filter_id, **values), "mask": mask}
            return graph_cut_inside(rgba(scene), params)
        params = {**catalog_values(filter_id, **values), "mask": mask}
        return walker_probability(rgba(scene), params) >= 0.5

    def boundaries(mask: NDArray[np.uint8], **values: Any) -> dict[str, Any]:
        params = {**catalog_values(filter_id, output="boundaries", **values), "mask": mask}
        return shown(function(rgba(scene), params, lambda _: None))

    if filter_id == "graph-cut":
        third = {"title": "Region weight 0", "image": boundaries(spot, **{"lambda": 0})}
        message = (
            "A disk and a square with noise of sigma 10, and a small square selected inside the "
            "disk. Then the object with the defaults, with a region weight of 0, and with a "
            "seed map that also marks the square as background."
        )
    else:
        params = {**catalog_values(filter_id, output="probability"), "mask": spot}
        third = {
            "title": "Probability",
            "image": picture(
                np.asarray(random_walker_filter(rgba(scene), params, lambda _: None))[..., 0]
            ),
        }
        message = (
            "A disk and a square with noise of sigma 10, and a small square selected inside the "
            "disk. Then the object with the defaults, the probability of the object, and the "
            "object with a seed map that also marks the square as background."
        )
    figure(
        out,
        filter_id,
        message,
        [
            {"title": "Input and seed", "image": picture(with_seed_boxes(scene, False))},
            {"title": "Object", "image": boundaries(spot)},
            third,
            {"title": "Square marked", "image": boundaries(seed_map(), seeds="map")},
        ],
    )
    rows = []
    if filter_id == "graph-cut":
        settings = [{"sigma": s, "lambda": lam} for s in (5, 10, 20) for lam in (0, 1)]
        headers = ["Edge contrast sigma", "Region weight lambda"]
    else:
        settings = [{"beta": b} for b in (30, 130, 500)]
        headers = ["Edge strength beta"]
    for values in settings:
        for name, mask, extra in (("Spot", spot, {}), ("Map", seed_map(), {"seeds": "map"})):
            found = object_of(mask, **values, **extra)
            rows.append(
                [f"{v:g}" for v in values.values()]
                + [
                    name,
                    str(int(found.sum())),
                    fix(iou(found, round_part), 3),
                    fix(float((found & square).sum() / square.sum()), 2),
                ]
            )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table([*headers, "Seeds", "Area (px)", "Overlap", "Share of the square"], rows)
        + "\nThe image of the figure. Spot is the small square selected inside the disk, with "
        "the image edge as background. Map also marks a small square inside the square as "
        "background. The disk has 2453 pixels. The overlap is the area of the object and the "
        "disk together divided by the area of either. The share of the square is the part of "
        "the square inside the object.\n"
    )


def color_scene(noise: float) -> Color:
    """A red disk and a green square on a blue ground. The disk and the square have about the same
    luma, 90.4 and 90.0."""
    round_part, square = contour_truth()
    rgb = np.zeros((160, 160, 3))
    rgb[...] = (40, 60, 150)
    rgb[round_part] = (210, 60, 40)
    rgb[square] = (40, 108, 60)
    rng = np.random.default_rng(6)
    return to_8bit(rgb + rng.normal(0, noise, rgb.shape))


def grabcut_docs(out: dict[Path, str]) -> None:
    filter_id = "grabcut"
    round_part, _ = contour_truth()
    box = box_selection(44, 16, 72, 72)

    def boundaries(scene: Color) -> dict[str, Any]:
        params = {**catalog_values(filter_id, output="boundaries"), "mask": box}
        return shown(grabcut(rgba_color(scene), params, lambda _: None))

    framed = color_scene(10).copy()
    edge = np.zeros((160, 160), bool)
    edge[44, 16:88] = edge[115, 16:88] = edge[44:116, 16] = edge[44:116, 87] = True
    framed[edge] = 255
    figure(
        out,
        filter_id,
        "A red disk and a green square on a blue ground with noise of sigma 10, and a box "
        "selected around the disk. Then the object with the defaults, and the same box on the "
        "image with noise of sigma 30 and 60.",
        [
            {"title": "Input and box", "image": color_picture(framed)},
            {"title": "Noise 10", "image": boundaries(color_scene(10))},
            {"title": "Noise 30", "image": boundaries(color_scene(30))},
            {"title": "Noise 60", "image": boundaries(color_scene(60))},
        ],
    )
    rows = []
    for kind in ("Color", "Gray"):
        for noise in (10, 30, 60):
            image = (
                rgba_color(color_scene(noise)) if kind == "Color" else rgba(contour_scene(noise))
            )
            for iterations in (1, 5, 10):
                params = {**catalog_values(filter_id, iterations=iterations), "mask": box}
                found = grabcut_inside(image, params)
                rows.append(
                    [
                        kind,
                        f"{noise:g}",
                        str(iterations),
                        str(int(found.sum())),
                        fix(iou(found, round_part), 3),
                    ]
                )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Image", "Noise sigma", "Iterations", "Area (px)", "Overlap"], rows)
        + "\nThe box of the figure. Color is the image of the figure, with the noise added to each "
        "color channel. Gray is a disk of 190 and a square of 160 on a ground of 50, slightly "
        "blurred, with gray noise. The disk has 2453 pixels. The overlap is the area of the "
        "object and the disk together divided by the area of either.\n"
    )


# Edge-preserving denoising ----------------------------------------------------------------------


def denoise_clean() -> Gray:
    """The disk and the square of the contour scene, slightly blurred, with no noise."""
    round_part, square = contour_truth()
    gray = np.full((160, 160), 50.0)
    gray[round_part] = 190
    gray[square] = 160
    return to_8bit(np.asarray(ndimage.gaussian_filter(gray, 1.5)))


def dotted_texture() -> Gray:
    """The disk and the square on a ground with a grid of bright dots, 2 pixels wide, every 8."""
    gray = denoise_clean().astype(np.float64)
    for r in range(4, 160, 8):
        for c in range(4, 160, 8):
            gray[r : r + 2, c : c + 2] += 60
    return to_8bit(gray)


EDGE_PRESERVING: dict[str, tuple[Any, list[dict[str, Any]], list[str]]] = {
    "nlm": (
        nlm,
        [{"h": h, "sigma": s} for h in (10, 16, 25.5) for s in (0, 20)],
        ["h", "sigma"],
    ),
    "tv-denoise": (
        tv_denoise,
        [{"weight": w, "solver": s} for w in (0.05, 0.1, 0.2) for s in ("chambolle", "bregman")],
        ["weight", "solver"],
    ),
    "domain-transform": (
        domain_transform,
        [{"sigmaSpatial": s, "sigmaColor": c} for s in (10, 30, 60) for c in (40, 80, 120)],
        ["sigmaSpatial", "sigmaColor"],
    ),
    "rolling-guidance": (
        rolling_guidance,
        [{"start": s, "sigmaColor": c} for s in ("paper", "opencv") for c in (25, 50)],
        ["start", "sigmaColor"],
    ),
    "susan-smoothing": (
        susan_smoothing,
        [{"threshold": t, "sigma": s} for t in (10, 20, 40) for s in (1, 2)],
        ["threshold", "sigma"],
    ),
}
FIGURE_SETTINGS: dict[str, list[tuple[str, dict[str, Any]]]] = {
    "nlm": [("Defaults", {}), ("h = 10", {"h": 10}), ("h = 16, sigma 20", {"h": 16, "sigma": 20})],
    "tv-denoise": [
        ("Weight 0.1", {}),
        ("Weight 0.4", {"weight": 0.4}),
        ("Split Bregman", {"solver": "bregman"}),
    ],
    "domain-transform": [
        ("Defaults", {}),
        ("Color sigma 40", {"sigmaColor": 40}),
        ("Recursive", {"mode": "rf"}),
    ],
    "rolling-guidance": [
        ("Paper start", {}),
        ("OpenCV start", {"start": "opencv"}),
        ("Scale 1.5", {"sigmaSpace": 1.5}),
    ],
    "susan-smoothing": [
        ("t = 20", {}),
        ("t = 40", {"threshold": 40}),
        ("t = 10", {"threshold": 10}),
    ],
}


def edge_preserving_docs(out: dict[Path, str], filter_id: str) -> None:
    function, settings, keys = EDGE_PRESERVING[filter_id]
    textured = filter_id == "rolling-guidance"
    clean = dotted_texture() if textured else denoise_clean()
    noisy_image = noisy(clean, 20, seed=1)
    source = clean if textured else noisy_image
    reference = denoise_clean()
    figure(
        out,
        filter_id,
        (
            "A disk and a square on a ground with a grid of small bright dots, and no noise. "
            if textured
            else "A disk and a square, slightly blurred, with noise of sigma 20. "
        )
        + "Then the filter with "
        + ", ".join(label for label, _ in FIGURE_SETTINGS[filter_id])
        + ".",
        [{"title": "Input", "image": picture(source)}]
        + [
            {"title": label, "image": picture(run(function, source, filter_id, **values))}
            for label, values in FIGURE_SETTINGS[filter_id]
        ],
    )
    rows = []
    for values in settings:
        result = run(function, source, filter_id, **values)
        rows.append(
            [str(values[k]) if isinstance(values[k], str) else f"{values[k]:g}" for k in keys]
            + [fix(psnr(result, reference), 2)]
        )
    labels = {
        "h": "Strength h",
        "sigma": "Sigma",
        "weight": "Weight",
        "solver": "Solver",
        "sigmaSpatial": "Spatial sigma",
        "sigmaColor": "Color sigma",
        "start": "Start",
        "threshold": "Threshold t",
    }
    if textured:
        note = (
            "\nThe image of the figure, with the other defaults. The PSNR compares the result with "
            "the same image without the dots, so it is higher when more of the dots are gone. "
            f"The input itself scores {fix(psnr(source, reference), 2)} dB.\n"
        )
    else:
        note = (
            "\nThe image of the figure, with the other defaults. The PSNR compares the result with "
            f"the image before the noise. The noisy input scores {fix(psnr(source, reference), 2)} "
            "dB.\n"
        )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id) + md_table([labels[k] for k in keys] + ["PSNR (dB)"], rows) + note
    )


# Robust estimation ------------------------------------------------------------------------------


def mixed_noise() -> Gray:
    """The disk and the square with Gaussian noise of sigma 10 and 10 percent impulses."""
    rng = np.random.default_rng(8)
    gray = denoise_clean().astype(np.float64) + rng.normal(0, 10, (160, 160))
    hits = rng.random((160, 160)) < 0.1
    gray[hits] = rng.choice([0.0, 255.0], int(hits.sum()))
    return to_8bit(gray)


def m_estimator_docs(out: dict[Path, str]) -> None:
    filter_id = "m-estimator"
    scene = mixed_noise()
    reference = denoise_clean()
    median = to_8bit(np.asarray(ndimage.median_filter(scene.astype(np.float64), 5, mode="nearest")))
    figure(
        out,
        filter_id,
        "A disk and a square with Gaussian noise of sigma 10 and 10 percent of pixels set to "
        "black or white. Then a 5 x 5 median, and the M-estimator with Tukey and with Huber "
        "weights, both with a scale of 10.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Median 5 x 5", "image": picture(median)},
            {
                "title": "Tukey",
                "image": picture(run(m_estimator, scene, filter_id, scale=10, estimator="tukey")),
            },
            {
                "title": "Huber",
                "image": picture(run(m_estimator, scene, filter_id, scale=10, estimator="huber")),
            },
        ],
    )
    rows = [["Median 5 x 5", "", fix(psnr(median, reference), 2)]]
    for estimator in ("tukey", "huber"):
        for scale in (0, 5, 10, 20, 40):
            result = run(m_estimator, scene, filter_id, estimator=estimator, scale=scale)
            rows.append(
                [
                    estimator.capitalize(),
                    "auto" if scale == 0 else f"{scale:g}",
                    fix(psnr(result, reference), 2),
                ]
            )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Weights", "Scale", "PSNR (dB)"], rows)
        + "\nThe image of the figure, with a 5 x 5 window and 5 steps. The PSNR compares the "
        f"result with the image before the noise. The noisy input scores "
        f"{fix(psnr(scene, reference), 2)} dB.\n"
    )


def lit_scene() -> tuple[Gray, NDArray[np.float64]]:
    """Two rectangles, one brighter and one darker, on a background lit from one side, with
    noise of sigma 3."""
    rows, cols = np.mgrid[0:120, 0:160]
    background = 80 + 0.4 * cols + 0.2 * rows + 0.002 * (cols - 80) ** 2
    gray = background.copy()
    gray[30:60, 30:70] += 100
    gray[70:100, 90:140] -= 50
    return noisy(to_8bit(gray), 3, seed=3), background


def ransac_surface_docs(out: dict[Path, str]) -> None:
    filter_id = "ransac-surface"
    scene, background = lit_scene()
    figure(
        out,
        filter_id,
        "Two rectangles on a background that brightens to the right, with a slight bend. Then "
        "the corrected image, the fitted background, and the grid samples taken as background "
        "in yellow.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Corrected", "image": picture(run(ransac_surface, scene, filter_id))},
            {
                "title": "Background",
                "image": picture(run(ransac_surface, scene, filter_id, output="background")),
            },
            {
                "title": "Inliers",
                "image": shown(
                    ransac_surface(
                        rgba(scene),
                        catalog_values(filter_id, output="inliers"),
                        lambda _: None,
                    )
                ),
            },
        ],
    )
    rows = []
    for degree in (1, 2, 3):
        for threshold in (5, 10, 30):
            params = catalog_values(filter_id, degree=degree, threshold=threshold)
            fitted, inliers = fit_surface(rgba(scene), params)
            rows.append(
                [
                    str(degree),
                    f"{threshold:g}",
                    str(int(inliers.sum())),
                    fix(float(np.abs(fitted - background).max()), 1),
                ]
            )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Degree", "Threshold", "Inliers", "Largest error (levels)"], rows)
        + "\nThe image of the figure, with a grid step of 8 (300 samples) and 200 trials. The "
        "background is 80 + 0.4 x + 0.2 y + 0.002 (x - 80)^2, a surface of degree 2. The "
        "largest error compares the fitted surface with it over the whole image.\n"
    )


# Morphology with distances and max-trees --------------------------------------------------------


def shapes_scene() -> Gray:
    """White shapes on black: a rectangle 24 pixels wide, a disk of radius 26 and an L of
    width 12."""
    rows, cols = np.mgrid[0:160, 0:160]
    gray = np.zeros((160, 160), np.uint8)
    gray[20:140, 14:38] = 255
    gray[np.hypot(rows - 50, cols - 100) <= 26] = 255
    gray[96:144, 70:82] = 255
    gray[132:144, 70:140] = 255
    return gray


def medial_axis_docs(out: dict[Path, str]) -> None:
    filter_id = "medial-axis"
    scene = shapes_scene()
    figure(
        out,
        filter_id,
        "A rectangle 24 pixels wide, a disk of radius 26 and an L of width 12, white on black. "
        "Then the medial axis, its distances to the background, and the axis over the image.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Axis", "image": picture(run(medial_axis_filter, scene, filter_id))},
            {
                "title": "Distance",
                "image": picture(run(medial_axis_filter, scene, filter_id, output="distance")),
            },
            {
                "title": "Overlay",
                "image": shown(
                    medial_axis_filter(
                        rgba(scene), catalog_values(filter_id, output="overlay"), lambda _: None
                    )
                ),
            },
        ],
    )
    axis, distance = axis_and_distance(rgba(scene))
    parts, _ = ndimage.label(scene > 0, structure=np.ones((3, 3), bool))
    rows = []
    for k, name in enumerate(("Rectangle", "Disk", "L shape"), start=1):
        part = parts == k
        on = axis & part
        rows.append(
            [name, str(int(part.sum())), str(int(on.sum())), fix(float(distance[on].max()), 2)]
        )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Shape", "Pixels", "Axis pixels", "Largest distance (px)"], rows)
        + "\nThe image of the figure. The largest distance is half the width of the shape, "
        "or its radius, measured from a pixel center to the nearest background pixel center.\n"
    )


SPECK_SIZES = (1, 2, 3, 4)


def specks() -> list[tuple[int, int, int]]:
    """The top-left corners and sides of 40 bright specks, 10 of each side from 1 to 4 pixels."""
    rng = np.random.default_rng(9)
    corners: list[tuple[int, int, int]] = []
    while len(corners) < 40:
        r, c = (int(v) for v in rng.integers(5, 150, 2))
        near_disk = np.hypot(r - 50, c - 50) < 32
        near_lines = abs(r - 110) < 6 or abs(c - 120) < 6
        if (
            not near_disk
            and not near_lines
            and all(abs(r - a) + abs(c - b) > 8 for a, b, _ in corners)
        ):
            corners.append((r, c, SPECK_SIZES[len(corners) % 4]))
    return corners


def specks_scene() -> Gray:
    """A ground of 60 with a bright disk of radius 25, a bright line 1 x 70, a bright line
    80 x 1, 40 small bright specks, and dark pits of 3 x 3 where the ground is plain (22)."""
    rows, cols = np.mgrid[0:160, 0:160]
    gray = np.full((160, 160), 60.0)
    gray[np.hypot(rows - 50, cols - 50) <= 25] = 200
    gray[110, 10:80] = 210
    gray[20:100, 120] = 210
    for r, c, size in specks():
        gray[r : r + size, c : c + size] = 230
    rng = np.random.default_rng(10)
    for r, c in rng.integers(5, 155, (25, 2)):
        if gray[r : r + 3, c : c + 3].max() == 60:
            gray[r : r + 3, c : c + 3] = 10
    return to_8bit(gray)


TREE_FILTERS: dict[str, tuple[Any, list[dict[str, Any]]]] = {
    "area-opening": (
        area_opening_filter,
        [{"area": a} for a in (4, 16, 64, 256)],
    ),
    "area-closing": (
        area_closing_filter,
        [{"area": a} for a in (4, 16, 64, 256)],
    ),
    "attribute-opening": (
        attribute_opening,
        [
            {"attribute": attribute, "threshold": t}
            for attribute in ("diameter", "area")
            for t in (4, 8, 32)
        ],
    ),
}


def tree_docs(out: dict[Path, str], filter_id: str) -> None:
    function, settings = TREE_FILTERS[filter_id]
    scene = specks_scene()
    panels: list[tuple[str, dict[str, Any]]]
    if filter_id == "attribute-opening":
        panels = [
            ("Diameter 8", {"threshold": 8}),
            ("Area 32", {"attribute": "area", "threshold": 32}),
            ("Diameter 32", {"threshold": 32}),
        ]
    else:
        panels = [(f"Area {a}", {"area": a}) for a in (16, 64, 256)]
    figure(
        out,
        filter_id,
        "A bright disk, two thin bright lines, small bright specks and small dark pits on a gray "
        "ground. Then the filter with " + ", ".join(label.lower() for label, _ in panels) + ".",
        [{"title": "Input", "image": picture(scene)}]
        + [
            {"title": label, "image": picture(run(function, scene, filter_id, **values))}
            for label, values in panels
        ],
    )
    rows = []
    for values in settings:
        result = run(function, scene, filter_id, **values)
        left = [
            sum(int(result[r, c]) > 150 for r, c, s in specks() if s == size)
            for size in SPECK_SIZES
        ]
        pits = int((result <= 30).sum()) // 9
        rows.append(
            [f"{v}" if isinstance(v, str) else f"{v:g}" for v in values.values()]
            + [" / ".join(str(n) for n in left), str(pits)]
            + ["yes" if (result[110, 10:80] > 150).all() else "no"]
        )
    headers = ["Attribute", "Threshold"] if filter_id == "attribute-opening" else ["Area"]
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(
            [*headers, "Specks left (1 / 2 / 3 / 4 px)", "Dark pits left", "Line kept"], rows
        )
        + "\nThe image of the figure, with 8 neighbors. There are 10 bright specks of each side "
        "from 1 to 4 pixels, so of 1, 4, 9 and 16 pixels. A speck is left when its corner pixel "
        "stays above 150. The dark pits are 3 x 3, and are counted by their pixels at or below 30. "
        "The line kept column says whether the horizontal line, 1 pixel thick and 70 long, stays "
        "above 150 along its whole length.\n"
    )


# Structured edges -------------------------------------------------------------------------------


def structured_edge_model() -> Path | None:
    """The downloaded model in the repository's models folder, or None. The docs material for
    structured-edge is only made where the model is downloaded, and kept in git otherwise."""
    entry = model_entry(MODEL_ID, CATALOG)
    path = model_path(entry, ROOT / "models") if entry else None
    return path if path and path.is_file() else None


def structured_edge_docs(out: dict[Path, str]) -> None:
    import os

    from skimage import feature

    # scikit-image has no type hints.
    untyped: Any = feature
    if structured_edge_model() is None:
        return
    os.environ["PIXELNEXUS_MODELS_DIR"] = str(ROOT / "models")
    filter_id = "structured-edge"
    scene = texture_scene()
    canny_edges = untyped.canny(scene / 255.0).astype(np.uint8) * 255
    figure(
        out,
        filter_id,
        f"{TEXTURE_MESSAGE} Then the Canny edges of scikit-image with its defaults, and the "
        "structured edges as a probability and thinned.",
        [
            {"title": "Input", "image": picture(scene)},
            {"title": "Canny", "image": picture(canny_edges)},
            {"title": "Probability", "image": picture(run(structured_edge, scene, filter_id))},
            {
                "title": "Thin edges",
                "image": picture(run(structured_edge, scene, filter_id, output="thin")),
            },
        ],
    )
    thin = run(structured_edge, scene, filter_id, output="thin")
    rows = []
    for name, (r, c) in zip(TEXTURE_PATCHES, [(0, 0), (0, 80), (80, 0), (80, 80)], strict=True):
        inner = (slice(r + 4, r + 76), slice(c + 4, c + 76))
        rows.append(
            [name, str(int((thin[inner] > 50).sum())), str(int((canny_edges[inner] > 0).sum()))]
        )
    across = int((thin[78:82, :] > 50).sum() + (thin[:, 78:82] > 50).sum())
    rows.append(
        [
            "Borders between the quarters",
            str(across),
            str(int((canny_edges[78:82, :] > 0).sum() + (canny_edges[:, 78:82] > 0).sum())),
        ]
    )
    out[ROOT / "docs" / "_generated" / "examples" / f"{filter_id}.md"] = (
        header(filter_id)
        + md_table(["Area", "Structured edges above 50", "Canny edge pixels"], rows)
        + "\nThe test image of the figure. Each quarter is counted without a margin of 4 "
        "pixels, so its border with the next quarter is left out. The border row counts the "
        "bands 4 pixels wide along the two borders between the quarters. Structured edges "
        "count when the thinned edge is above 50 of 255.\n"
    )


def filter_id_title(filter_id: str) -> str:
    return {"deblock": "Deblocked", "dering": "Deringed", "jpeg-cleanup": "Cleaned"}[filter_id]


def build() -> dict[Path, str]:
    out: dict[Path, str] = {}
    wavelet_threshold_docs(out)
    swt_denoise_docs(out)
    wavelet_wiener_docs(out)
    radon_docs(out)
    ridgelet_docs(out)
    directional_docs(out, "curvelet")
    directional_docs(out, "shearlet")
    steerable_docs(out)
    tv_deblur_docs(out)
    sparse_fista_docs(out)
    blind_deconv_docs(out)
    plugplay_docs(out, "pnp-admm")
    plugplay_docs(out, "red")
    dehaze_docs(out)
    deband_docs(out)
    descreen_docs(out)
    jpeg_docs(out)
    inpaint_docs(out)
    sr_classical_docs(out)
    for filter_id in RIDGE_FILTERS:
        ridge_docs(out, filter_id)
    for filter_id in BLOB_FILTERS:
        blob_docs(out, filter_id)
    for filter_id in KEYPOINT_FILTERS:
        keypoint_docs(out, filter_id)
    susan_docs(out)
    mser_docs(out)
    lbp_docs(out)
    ltp_docs(out)
    glcm_docs(out)
    hog_docs(out)
    phase_congruency_docs(out)
    hough_lines_docs(out)
    hough_circles_docs(out)
    hough_linking_docs(out)
    matched_filter_docs(out)
    for filter_id in SEGMENTERS:
        segmenter_docs(out, filter_id)
    multi_otsu_docs(out)
    watershed_docs(out)
    marker_watershed_docs(out)
    chan_vese_docs(out)
    level_set_docs(out)
    active_contour_docs(out)
    seeded_docs(out, "graph-cut")
    seeded_docs(out, "random-walker")
    grabcut_docs(out)
    for filter_id in EDGE_PRESERVING:
        edge_preserving_docs(out, filter_id)
    m_estimator_docs(out)
    ransac_surface_docs(out)
    medial_axis_docs(out)
    for filter_id in TREE_FILTERS:
        tree_docs(out, filter_id)
    structured_edge_docs(out)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if files are out of date")
    args = parser.parse_args(argv)
    stale = []
    for path, text in build().items():
        docs = ROOT / "docs" in path.parents
        if args.check and not docs:
            continue  # Figure data is not committed.
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == text:
            continue
        if args.check:
            stale.append(str(path.relative_to(ROOT)))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
    if stale:
        print("Out of date: " + ", ".join(stale) + ". Run tools/engine_docs.py.")
        return 1
    print("Engine docs material is up to date." if args.check else "Wrote engine docs material.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
