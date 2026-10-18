"""Learned filters that run approved models from catalog/models.yaml with ONNX Runtime (Phase 7c).

Each model downloads only on the user's request. Models published as PyTorch weights run from the
ONNX file that tools/export_models.py wrote next to them, once, on this machine. The engine never
imports PyTorch.

Large images run in tiles of TILE pixels. Each tile is read with a margin at least as wide as the
reach of the network, and only its center is kept, so the result equals a run on the whole image
up to rounding. Pixels outside the image are zeros, as in a run on the whole image.

* dncnn: DnCNN, color and blind, for noise; or DnCNN-3, gray, on the brightness Y of full-range
  Y'CbCr with the BT.709 weights, for JPEG blocking. Cb and Cr stay. Our choice for color images.
* ffdnet: FFDNet color with the noise level as an input. The image is padded to even sides by
  repeating the edge, as FFDNet itself does, and cropped back.
* real-esrgan, edsr, srcnn: super-resolution. Colors are premultiplied by alpha first, as Resize
  does, and alpha is enlarged with bicubic (OpenCV INTER_CUBIC). EDSR and FSRCNN run through
  OpenCV's dnn_superres module.
* learned-edges: HED, exported from its Caffe weights, or PiDiNet. HED reads BGR from 0 to 255
  minus the mean of its training images, PiDiNet RGB normalized with the ImageNet mean and
  deviation. Both pool four times, so tiles of 768 pixels start at multiples of 16, with 128
  pixels of margin, more than the reach of either network.
* fast-style: the fast neural style models of the ONNX model zoo, at any size: their fixed 224 x
  224 input is made free in memory. Their output is rounded up to a multiple of 4 and cropped.
* swinir, swinir-sr: SwinIR color denoising for noise 25, and lightweight 2x super-resolution.
  SwinIR builds its attention masks from the input size, so each model is exported for one tile
  size (SWINIR_TILE) and runs in tiles of exactly that size. Each tile overlaps its neighbors by
  SWINIR_MARGIN pixels on each side, as in the tile mode of SwinIR's own test script, and only its
  center is kept. The image is mirrored past its edges to fill the tiles. Shifted windows let
  every layer see a little further, so a tiled run is close to a run on the whole image, not equal.
* restormer: Restormer for real camera noise, or for motion blur, as in demo.py of the Restormer
  repository: the image is mirrored at the bottom and right to sides that are multiples of 8.
  Images up to RESTORMER_TILE pixels on each side run whole. Larger ones run in tiles of that
  size that overlap by at least 32 pixels, and the overlaps are averaged. Its attention spans the
  whole input across channels, so tiles are close to a whole run, not equal. The result is
  clamped to 0 to 1.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

from pixelnexus_engine.inference import relaxed_session, session
from pixelnexus_engine.models import model_entry, require
from pixelnexus_engine.planes import rgb_to_ycc, ycc_to_rgb
from pixelnexus_engine.registry import Progress, Rgba, find_catalog, register

Float = NDArray[np.float32]
# The type stubs of OpenCV lag behind OpenCV 5.
CV: Any = cv2
TILE = 512
# The reach of each network in pixels, from its layers: 20 3 x 3 convolutions for DnCNN, 12 at half
# resolution for FFDNet, 34 for the compact Real-ESRGAN, rounded up.
REACH = {"dncnn": 24, "ffdnet": 32, "real-esrgan": 40, "learned-edges": 128}
# The mean of the HED training images, BGR, from the HED tutorial notebook.
HED_MEAN = np.array([104.00698793, 116.66876762, 122.67891434], np.float32)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], np.float32)
# Tile sizes of the SwinIR exports (tools/export_models.py), and the overlap of SwinIR's own
# test script.
SWINIR_TILE = {"swinir-lightweight-x2": 128, "swinir-color-dn25": 256}
SWINIR_MARGIN = 32
# The tile size and overlap of the example in Restormer's demo.py.
RESTORMER_TILE = 720
RESTORMER_OVERLAP = 32


@cache
def filter_entry(filter_id: str) -> dict[str, Any]:
    import yaml

    folder = find_catalog()
    if folder is None:
        raise ValueError("The engine found no catalog.")
    for path in folder.rglob(f"{filter_id}.yaml"):
        entry: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
        return entry
    raise ValueError(f"No catalog entry for {filter_id}.")


def chosen_model(filter_id: str, params: dict[str, Any]) -> str:
    """The model for these settings: by modelChoices when the entry has them."""
    entry = filter_entry(filter_id)
    choices = entry.get("modelChoices")
    if choices:
        model: str = choices["models"][params[choices["param"]]]
        return model
    default: str = entry["model"]
    return default


def model_file(model_id: str) -> Path:
    """The file the engine runs: the download, or for PyTorch weights the exported ONNX file."""
    path = require(model_id)
    entry = model_entry(model_id) or {}
    if entry.get("format") not in ("pytorch", "caffe"):
        return path
    exported = path.parent / "model.onnx"
    if not exported.is_file():
        raise ValueError(
            f"The model '{entry.get('name', model_id)}' is downloaded but not yet converted to "
            "ONNX. Run once on this computer: "
            f".venv-export/bin/python tools/export_models.py {model_id}"
        )
    return exported


def tiled(
    run: Callable[[Float], Float],
    image: Float,
    reach: int,
    scale: int = 1,
    tile: int = TILE,
    progress: Progress | None = None,
) -> Float:
    """Run a network on a CHW image in tiles, each read with `reach` pixels of margin."""
    _, height, width = image.shape
    out: Float | None = None
    rows = range(0, height, tile)
    cols = range(0, width, tile)
    count, done = len(rows) * len(cols), 0
    for top in rows:
        for left in cols:
            bottom, right = min(top + tile, height), min(left + tile, width)
            y0, x0 = max(top - reach, 0), max(left - reach, 0)
            y1, x1 = min(bottom + reach, height), min(right + reach, width)
            result = run(image[:, y0:y1, x0:x1])
            if out is None:
                out = np.zeros((result.shape[0], height * scale, width * scale), np.float32)
            dy, dx = (top - y0) * scale, (left - x0) * scale
            out[:, top * scale : bottom * scale, left * scale : right * scale] = result[
                :, dy : dy + (bottom - top) * scale, dx : dx + (right - left) * scale
            ]
            done += 1
            if progress is not None:
                progress(0.9 * done / count)
    assert out is not None
    return out


def network(path: Path, extra: dict[str, Float] | None = None) -> Callable[[Float], Float]:
    """A function from a CHW array to the network's CHW output, for a single-image input."""
    model = session(path)
    name = model.get_inputs()[0].name

    def run(chw: Float) -> Float:
        feed = {name: chw[None].astype(np.float32), **(extra or {})}
        output: Float = model.run(None, feed)[0][0]
        return output

    return run


def to_chw(image: Rgba) -> Float:
    out: Float = np.ascontiguousarray(image[..., :3].transpose(2, 0, 1), np.float32) / np.float32(
        255
    )
    return out


def from_chw(chw: Float, alpha: NDArray[np.uint8]) -> Rgba:
    rgb = np.clip(np.rint(chw.transpose(1, 2, 0) * 255), 0, 255).astype(np.uint8)
    out: Rgba = np.dstack([rgb, alpha])
    return out


def premultiplied(image: Rgba) -> tuple[Float, Float]:
    alpha: Float = image[..., 3].astype(np.float32) / np.float32(255)
    colors: Float = to_chw(image) * alpha[None]
    return colors, alpha


def straight(colors: Float, alpha: Float) -> Rgba:
    a = np.clip(alpha, 0, 1)
    safe = np.where(a > 0, a, 1)
    rgb: Float = np.where(a[None] > 0, colors / safe[None], 0).astype(np.float32)
    return from_chw(rgb, np.clip(np.rint(a * 255), 0, 255).astype(np.uint8))


def enlarge_alpha(alpha: Float, scale: int) -> Float:
    height, width = alpha.shape
    out: Float = np.asarray(
        cv2.resize(alpha, (width * scale, height * scale), interpolation=cv2.INTER_CUBIC),
        np.float32,
    )
    return out


def network_stages(name: str, model: str, steps: list[tuple[str, str, str]]) -> dict[str, Any]:
    entry = model_entry(model) or {}
    return {
        "kind": "stages",
        "stages": [
            *({"name": n, "formula": f, "note": note} for n, f, note in steps),
            {
                "name": "Model",
                "formula": f"\\text{{{name}}}",
                "note": f"{entry.get('name', model)}, {entry.get('license', '')}".strip(", "),
            },
        ],
    }


# DnCNN ------------------------------------------------------------------------------------------


def dncnn_representation(params: dict[str, Any]) -> dict[str, Any]:
    model = chosen_model("dncnn", params)
    if params["task"] == "jpeg":
        steps = [
            ("Brightness", "Y = 0.2126 R + 0.7152 G + 0.0722 B", "DnCNN-3 works on one channel."),
            (
                "Network",
                "\\hat{Y} = Y - f(Y)",
                "20 convolutions predict the artifacts, which are subtracted.",
            ),
        ]
    else:
        steps = [
            (
                "Network",
                "\\hat{x} = x - f(x)",
                "20 convolutions predict the noise, which is subtracted.",
            )
        ]
    return network_stages("DnCNN", model, steps)


@register("dncnn", representation=dncnn_representation)
def dncnn(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    path = model_file(chosen_model("dncnn", params))
    run = network(path)
    if params["task"] == "jpeg":
        rgb = image[..., :3].astype(np.float64)
        y, cb, cr = rgb_to_ycc(rgb[..., 0], rgb[..., 1], rgb[..., 2])
        clean = tiled(run, (y / 255).astype(np.float32)[None], REACH["dncnn"], progress=progress)
        r, g, b = ycc_to_rgb(clean[0].astype(np.float64) * 255, cb, cr)
        out = image.copy()
        out[..., :3] = np.clip(np.rint(np.dstack([r, g, b])), 0, 255).astype(np.uint8)
        progress(1.0)
        return out
    result = tiled(run, to_chw(image), REACH["dncnn"], progress=progress)
    progress(1.0)
    return from_chw(result, image[..., 3])


# FFDNet -----------------------------------------------------------------------------------------


def ffdnet_representation(params: dict[str, Any]) -> dict[str, Any]:
    sigma = params["sigma"]
    return network_stages(
        "FFDNet",
        chosen_model("ffdnet", params),
        [
            (
                "Downsample",
                "x \\to 4 \\text{ subimages}",
                "The image is split into four half-size images.",
            ),
            (
                "Noise map",
                f"M = {sigma:g} / 255",
                "The noise level is a constant extra input channel.",
            ),
            (
                "Network",
                "\\hat{x} = \\text{up}(f(\\text{down}(x), M))",
                "12 convolutions, then the halves are put back together.",
            ),
        ],
    )


@register("ffdnet", representation=ffdnet_representation)
def ffdnet(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    path = model_file(chosen_model("ffdnet", params))
    model = session(path)
    sigma = np.full((1, 1, 1, 1), params["sigma"] / 255, np.float32)
    height, width = image.shape[:2]
    padded = np.pad(image, ((0, height % 2), (0, width % 2), (0, 0)), mode="edge")

    def run(chw: Float) -> Float:
        # Tiles are cut at even offsets with even sizes inside the padded image.
        output: Float = model.run(None, {"image": chw[None], "sigma": sigma})[0][0]
        return output

    result = tiled(run, to_chw(padded), REACH["ffdnet"], progress=progress)
    progress(1.0)
    return from_chw(result[:, :height, :width], image[..., 3])


# Super-resolution -------------------------------------------------------------------------------


def sr_representation(
    name: str, filter_id: str, scale: int
) -> Callable[[dict[str, Any]], dict[str, Any]]:
    def representation(params: dict[str, Any]) -> dict[str, Any]:
        return network_stages(
            name,
            chosen_model(filter_id, params),
            [
                (
                    "Premultiply",
                    "c' = c \\cdot \\alpha",
                    "Colors are premultiplied by alpha, as in Resize.",
                ),
                (
                    "Network",
                    f"\\hat{{x}} = f(x),\\ {scale}\\times",
                    "The network adds detail and enlarges.",
                ),
                ("Alpha", "\\alpha' = \\text{bicubic}(\\alpha)", "Alpha is enlarged with bicubic."),
            ],
        )

    return representation


@register("real-esrgan", representation=sr_representation("Real-ESRGAN", "real-esrgan", 4))
def real_esrgan(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    run = network(model_file(chosen_model("real-esrgan", params)))
    colors, alpha = premultiplied(image)
    result = tiled(run, colors, REACH["real-esrgan"], scale=4, tile=256, progress=progress)
    progress(1.0)
    return straight(result, enlarge_alpha(alpha, 4))


def superres(image: Rgba, model_id: str, algorithm: str, scale: int, progress: Progress) -> Rgba:
    sr = CV.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(str(model_file(model_id)))
    sr.setModel(algorithm, scale)
    colors, alpha = premultiplied(image)
    bgr = np.clip(np.rint(colors[::-1].transpose(1, 2, 0) * 255), 0, 255).astype(np.uint8)
    progress(0.2)
    big = sr.upsample(bgr).astype(np.float32)[..., ::-1].transpose(2, 0, 1) / 255
    progress(1.0)
    return straight(np.ascontiguousarray(big), enlarge_alpha(alpha, scale))


@register("edsr", representation=sr_representation("EDSR", "edsr", 4))
def edsr(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return superres(image, chosen_model("edsr", params), "edsr", 4, progress)


@register("srcnn", representation=sr_representation("FSRCNN", "srcnn", 2))
def srcnn(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    return superres(image, chosen_model("srcnn", params), "fsrcnn", 2, progress)


# Fast neural style ------------------------------------------------------------------------------


def style_representation(params: dict[str, Any]) -> dict[str, Any]:
    return network_stages(
        "Fast neural style",
        chosen_model("fast-style", params),
        [
            (
                "Network",
                "y = f_{\\text{style}}(x)",
                "A feed-forward network trained for one painting.",
            ),
            (
                "Strength",
                f"(1 - {params['strength']:g})\\, x + {params['strength']:g}\\, y",
                "Our choice: mix with the input.",
            ),
        ],
    )


@register("fast-style", representation=style_representation)
def fast_style(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    model = relaxed_session(model_file(chosen_model("fast-style", params)))
    name = model.get_inputs()[0].name
    height, width = image.shape[:2]
    x = image[..., :3].transpose(2, 0, 1).astype(np.float32)[None]
    progress(0.1)
    styled = model.run(None, {name: x})[0][0][:, :height, :width]
    strength = float(params["strength"])
    mixed = (1 - strength) * x[0] + strength * styled
    out = image.copy()
    out[..., :3] = np.clip(np.rint(mixed.transpose(1, 2, 0)), 0, 255).astype(np.uint8)
    progress(1.0)
    return out


# Learned edges ----------------------------------------------------------------------------------


def edges_representation(params: dict[str, Any]) -> dict[str, Any]:
    if params["network"] == "hed":
        steps = [
            (
                "Input",
                "x = \\text{BGR} - \\mu",
                "Pixels from 0 to 255, minus the mean of the training images.",
            ),
            (
                "Side outputs",
                "s_k = \\text{up}(w_k^T h_k),\\ k = 1..5",
                "Each stage of VGG16 predicts edges at its scale.",
            ),
            (
                "Fuse",
                "E = \\sigma\\big(\\textstyle\\sum_k a_k s_k + b\\big)",
                "A learned weighting of the five side outputs.",
            ),
        ]
        name = "HED"
    else:
        steps = [
            (
                "Input",
                "x = (\\text{RGB} - \\mu) / \\sigma",
                "Normalized with the ImageNet mean and deviation.",
            ),
            (
                "Pixel differences",
                "y = \\sum_i w_i (x_i - x_j)",
                "Convolutions on differences of neighbors, as classic edge operators do.",
            ),
            (
                "Fuse",
                "E = \\sigma\\big(\\textstyle\\sum_k a_k s_k + b\\big)",
                "Side outputs of four stages, fused.",
            ),
        ]
        name = "PiDiNet"
    return network_stages(name, chosen_model("learned-edges", params), steps)


@register("learned-edges", representation=edges_representation)
def learned_edges(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    run = network(model_file(chosen_model("learned-edges", params)))
    rgb = image[..., :3].astype(np.float32)
    if params["network"] == "hed":
        x = (rgb[..., ::-1] - HED_MEAN).transpose(2, 0, 1)
    else:
        x = ((rgb / 255 - IMAGENET_MEAN) / IMAGENET_STD).transpose(2, 0, 1)
    edges = tiled(
        run,
        np.ascontiguousarray(x, np.float32),
        REACH["learned-edges"],
        tile=768,
        progress=progress,
    )[0]
    out = image.copy()
    out[..., :3] = np.clip(np.rint(edges * 255), 0, 255).astype(np.uint8)[..., None]
    progress(1.0)
    return out


# SwinIR -----------------------------------------------------------------------------------------


def fixed_tiles(
    run: Callable[[Float], Float],
    image: Float,
    size: int,
    margin: int,
    scale: int = 1,
    progress: Progress | None = None,
) -> Float:
    """Run a network that takes only size x size inputs on a CHW image of any size.

    Each tile keeps its center of (size - 2 margin) pixels. The image is mirrored past its edges,
    so the tiles at the edges are full too."""
    _, height, width = image.shape
    core = size - 2 * margin
    rows, cols = -(-height // core), -(-width // core)
    pad_y, pad_x = rows * core - height + margin, cols * core - width + margin
    padded = np.pad(image, ((0, 0), (margin, pad_y), (margin, pad_x)), mode="symmetric")
    out = np.zeros((3, rows * core * scale, cols * core * scale), np.float32)
    for row in range(rows):
        for col in range(cols):
            y, x = row * core, col * core
            result = run(np.ascontiguousarray(padded[:, y : y + size, x : x + size]))
            keep = result[
                :,
                margin * scale : (margin + core) * scale,
                margin * scale : (margin + core) * scale,
            ]
            out[:, y * scale : (y + core) * scale, x * scale : (x + core) * scale] = keep
            if progress is not None:
                progress(0.9 * (row * cols + col + 1) / (rows * cols))
    cropped: Float = out[:, : height * scale, : width * scale]
    return cropped


def swinir_representation(params: dict[str, Any]) -> dict[str, Any]:
    return network_stages(
        "SwinIR",
        "swinir-color-dn25",
        [
            (
                "Network",
                "\\hat{x} = x + f(x)",
                "Swin Transformer blocks attend inside windows of 8 x 8 pixels, shifted by 4 in "
                "every second block. The network adds a correction to the image.",
            ),
            (
                "Tiles",
                f"{SWINIR_TILE['swinir-color-dn25']} \\times {SWINIR_TILE['swinir-color-dn25']}",
                f"Tiles overlap by {SWINIR_MARGIN} pixels on each side, and only their centers "
                "are kept.",
            ),
        ],
    )


@register("swinir", representation=swinir_representation)
def swinir(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    model = "swinir-color-dn25"
    run = network(model_file(model))
    result = fixed_tiles(run, to_chw(image), SWINIR_TILE[model], SWINIR_MARGIN, progress=progress)
    progress(1.0)
    return from_chw(result, image[..., 3])


@register("swinir-sr", representation=sr_representation("SwinIR", "swinir-sr", 2))
def swinir_sr(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    model = "swinir-lightweight-x2"
    run = network(model_file(model))
    colors, alpha = premultiplied(image)
    result = fixed_tiles(run, colors, SWINIR_TILE[model], SWINIR_MARGIN, scale=2, progress=progress)
    progress(1.0)
    return straight(result, enlarge_alpha(alpha, 2))


# Restormer -------------------------------------------------------------------------------------


def averaged_tiles(run: Callable[[Float], Float], image: Float, tile: int, overlap: int) -> Float:
    """demo.py of Restormer: tiles of tile x tile pixels with a stride of tile - overlap, the last
    one flush with the edge, and the mean where tiles overlap. Sides are multiples of 8."""
    _, height, width = image.shape
    tile = min(tile, height, width)
    stride = tile - overlap
    rows = [*range(0, height - tile, stride), height - tile]
    cols = [*range(0, width - tile, stride), width - tile]
    total = np.zeros_like(image)
    count = np.zeros((1, height, width), np.float32)
    for y in rows:
        for x in cols:
            total[:, y : y + tile, x : x + tile] += run(image[:, y : y + tile, x : x + tile])
            count[:, y : y + tile, x : x + tile] += 1
    out: Float = total / count
    return out


def restormer_representation(params: dict[str, Any]) -> dict[str, Any]:
    return network_stages(
        "Restormer",
        chosen_model("restormer", params),
        [
            (
                "Pad",
                "H, W \\to \\text{multiples of } 8",
                "The image is mirrored at the bottom and right, as in Restormer's demo.",
            ),
            (
                "Network",
                "\\hat{x} = y + f(y)",
                "A U-shaped network of transformer blocks. Their attention compares channels, not "
                "pixels, so its cost grows only linearly with the image size.",
            ),
            (
                "Tiles",
                f"{RESTORMER_TILE} \\times {RESTORMER_TILE}",
                f"Larger images run in tiles that overlap by at least {RESTORMER_OVERLAP} pixels, "
                "and the overlaps are averaged.",
            ),
        ],
    )


@register("restormer", representation=restormer_representation)
def restormer(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    run = network(model_file(chosen_model("restormer", params)))
    height, width = image.shape[:2]
    pad_y, pad_x = -height % 8, -width % 8
    chw = to_chw(image)
    padded = np.pad(chw, ((0, 0), (0, pad_y), (0, pad_x)), mode="reflect")
    if max(padded.shape[1:]) <= RESTORMER_TILE:
        result = run(padded)
    else:
        result = averaged_tiles(run, padded, RESTORMER_TILE, RESTORMER_OVERLAP)
    progress(1.0)
    return from_chw(np.clip(result[:, :height, :width], 0, 1), image[..., 3])
