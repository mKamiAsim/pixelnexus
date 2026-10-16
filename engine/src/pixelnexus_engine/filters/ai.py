"""AI selection tasks for the AI router's engine model provider (PLAN.md section 3.11).

They run as jobs like filters, under ids that start with an underscore, since they are not
catalog filters. The route POST /api/v1/ai/{task} checks the task and the model against
catalog/ai-tasks.yaml and models.yaml. The result is a mask, returned as a gray image.

Pre- and post-processing follow each model's source:

* u2netp: as rembg, which publishes the file. Resize to 320 x 320 with Lanczos, divide by the
  largest value, normalize with the ImageNet mean and deviation, take the first output, stretch
  it from its minimum to its maximum, and resize back with Lanczos.
* birefnet-lite: as the onnx-community model card. Resize to 1024 x 1024 with bilinear, scale to
  0 to 1, normalize with the ImageNet mean and deviation, apply a sigmoid, resize back.
* efficientsam-ti: as EfficientSAM's ONNX example. The encoder takes the image from 0 to 1 at its
  own size. Points use label 1, and a box is two points with labels 2 and 3. EfficientSAM has no
  label for negative clicks, so a request with them is refused, not silently changed. Logits from
  0 up are inside, and the mask with the best predicted IoU is kept.
* sam2-1-tiny: as the onnx-community preprocessor config. Resize to 1024 x 1024 with bilinear,
  scale to 0 to 1, normalize with the ImageNet mean and deviation. Points and boxes are scaled to
  that size. Labels are 1 for positive and 0 for negative clicks. The low-resolution logits of
  the mask with the best IoU score are resized to the image with bilinear, and logits above 0 are
  inside.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

from pixelnexus_engine.filters.learned import IMAGENET_MEAN, IMAGENET_STD
from pixelnexus_engine.inference import session
from pixelnexus_engine.models import file_name, model_entry, model_files, require
from pixelnexus_engine.registry import Progress, Rgba, register

Float = NDArray[np.float32]


def local_files(model_id: str) -> list[Path]:
    """The main file and the extra files of a downloaded model, in catalog order."""
    folder = require(model_id).parent
    return [folder / file_name(f["sourceUrl"]) for f in model_files(model_entry(model_id) or {})]


def as_mask(image: Rgba, values: NDArray[Any]) -> Rgba:
    gray = np.clip(np.rint(values), 0, 255).astype(np.uint8)
    out: Rgba = np.dstack([gray, gray, gray, np.full_like(gray, 255)])
    return out


def imagenet(rgb: NDArray[np.uint8], size: tuple[int, int], resample: int) -> Float:
    """Resize, scale to 0 to 1, normalize with the ImageNet mean and deviation, as NCHW."""
    small = np.asarray(Image.fromarray(rgb).resize(size, resample), np.float32) / np.float32(255)
    x: Float = ((small - IMAGENET_MEAN) / IMAGENET_STD).transpose(2, 0, 1)[None]
    return np.ascontiguousarray(x, np.float32)


# Subject ----------------------------------------------------------------------------------------


@register("_ai-subject-select")
def subject_select(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    model_id = params["model"]
    rgb = np.ascontiguousarray(image[..., :3])
    height, width = rgb.shape[:2]
    if model_id == "u2netp":
        small = np.asarray(
            Image.fromarray(rgb).resize((320, 320), Image.Resampling.LANCZOS), np.float32
        )
        small = small / max(float(small.max()), 1e-6)
        x = np.ascontiguousarray(
            ((small - IMAGENET_MEAN) / IMAGENET_STD).transpose(2, 0, 1)[None], np.float32
        )
        model = session(require(model_id))
        progress(0.3)
        pred = model.run(None, {model.get_inputs()[0].name: x})[0][0, 0]
        low, high = float(pred.min()), float(pred.max())
        pred = (pred - low) / (high - low) if high > low else np.zeros_like(pred)
        mask = Image.fromarray((pred * 255).astype(np.uint8)).resize(
            (width, height), Image.Resampling.LANCZOS
        )
        progress(1.0)
        return as_mask(image, np.asarray(mask, np.float32))
    if model_id == "birefnet-lite":
        x = imagenet(rgb, (1024, 1024), Image.Resampling.BILINEAR)
        model = session(require(model_id))
        progress(0.2)
        logits = model.run(None, {"input_image": x})[0][0, 0]
        probability = 1 / (1 + np.exp(-logits))
        mask = cv2.resize(
            probability.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR
        )
        progress(1.0)
        return as_mask(image, mask * 255)
    raise ValueError(f"The model '{model_id}' does not do subject selection.")


# Click and box selection ------------------------------------------------------------------------


def prompts(
    params: dict[str, Any],
) -> tuple[list[tuple[float, float, bool]], tuple[float, ...] | None]:
    points = [
        (float(p["x"]), float(p["y"]), bool(p["positive"])) for p in params.get("points") or []
    ]
    box = params.get("box")
    corners = (
        (
            float(box["x"]),
            float(box["y"]),
            float(box["x"] + box["width"]),
            float(box["y"] + box["height"]),
        )
        if box
        else None
    )
    if not points and corners is None:
        raise ValueError("Add a click or draw a box first.")
    return points, corners


def efficient_sam(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    points, corners = prompts(params)
    if any(not positive for _, _, positive in points):
        raise ValueError(
            "EfficientSAM takes no negative clicks. Remove them, or choose SAM 2.1 tiny, which "
            "takes them."
        )
    encoder_path, decoder_path = local_files("efficientsam-ti")
    height, width = image.shape[:2]
    x = np.ascontiguousarray(image[..., :3].transpose(2, 0, 1)[None], np.float32) / np.float32(255)
    encoder = session(encoder_path)
    embeddings = encoder.run(None, {"batched_images": x})[0]
    progress(0.6)
    coords = [(px, py) for px, py, _ in points]
    labels = [1.0] * len(points)
    if corners is not None:
        coords += [(corners[0], corners[1]), (corners[2], corners[3])]
        labels += [2.0, 3.0]
    decoder = session(decoder_path)
    masks, iou, _ = decoder.run(
        None,
        {
            "image_embeddings": embeddings,
            "batched_point_coords": np.array(coords, np.float32)[None, None],
            "batched_point_labels": np.array(labels, np.float32)[None, None],
            "orig_im_size": np.array([height, width], np.int64),
        },
    )
    best = int(np.argmax(iou[0, 0]))
    progress(1.0)
    return as_mask(image, np.where(masks[0, 0, best] >= 0, 255.0, 0.0))


def sam2(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    points, corners = prompts(params)
    encoder_path, _, decoder_path, _ = local_files("sam2-1-tiny")
    height, width = image.shape[:2]
    sx, sy = 1024 / width, 1024 / height
    x = imagenet(np.ascontiguousarray(image[..., :3]), (1024, 1024), Image.Resampling.BILINEAR)
    encoder = session(encoder_path)
    names = [o.name for o in encoder.get_outputs()]
    embeddings = dict(zip(names, encoder.run(None, {"pixel_values": x}), strict=True))
    progress(0.6)
    feed: dict[str, Any] = {
        "input_points": np.array([[px * sx, py * sy] for px, py, _ in points], np.float32).reshape(
            1, 1, -1, 2
        ),
        "input_labels": np.array(
            [1 if positive else 0 for _, _, positive in points], np.int64
        ).reshape(1, 1, -1),
        "input_boxes": (
            np.array(
                [[corners[0] * sx, corners[1] * sy, corners[2] * sx, corners[3] * sy]], np.float32
            )[None]
            if corners is not None
            else np.zeros((1, 0, 4), np.float32)
        ),
        **embeddings,
    }
    decoder = session(decoder_path)
    iou, masks, _ = decoder.run(["iou_scores", "pred_masks", "object_score_logits"], feed)
    best = int(np.argmax(iou[0, 0]))
    logits = cv2.resize(
        masks[0, 0, best].astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR
    )
    progress(1.0)
    return as_mask(image, np.where(logits > 0, 255.0, 0.0))


def prompted_select(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    model_id = params["model"]
    if model_id == "efficientsam-ti":
        return efficient_sam(image, params, progress)
    if model_id == "sam2-1-tiny":
        return sam2(image, params, progress)
    raise ValueError(f"The model '{model_id}' does not do click or box selection.")


register("_ai-click-select")(prompted_select)
register("_ai-object-select")(prompted_select)
