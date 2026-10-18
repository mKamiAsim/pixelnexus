"""Uploaded images, kept in memory by content hash.

Images arrive as raw RGBA bytes with their width and height, never as JSON arrays. The id is the
SHA-256 hash of the size and the bytes, so the same image uploaded twice gets the same id and is
stored once. The store keeps the most recently used images up to a byte budget.
"""

from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

Rgba = NDArray[np.uint8]


class ImageError(ValueError):
    """An upload that breaks a rule. The message is safe to show to the user."""


@dataclass(frozen=True)
class StoredImage:
    id: str
    width: int
    height: int
    pixels: Rgba


def image_id(width: int, height: int, data: bytes) -> str:
    digest = hashlib.sha256()
    digest.update(f"{width}x{height}:".encode())
    digest.update(data)
    return digest.hexdigest()


def decode_rgba(data: bytes, width: int, height: int, max_pixels: int) -> Rgba:
    """Check the size rules and turn raw RGBA bytes into an array of shape (height, width, 4)."""
    if width < 1 or height < 1:
        raise ImageError("The width and the height must be at least 1.")
    if width * height > max_pixels:
        raise ImageError(f"The image has more than {max_pixels} pixels.")
    if len(data) != width * height * 4:
        raise ImageError("The data must hold 4 bytes, RGBA, for every pixel.")
    return np.frombuffer(data, dtype=np.uint8).reshape(height, width, 4).copy()


class ImageStore:
    """A thread-safe store of images by id, which forgets the least recently used first."""

    def __init__(self, max_bytes: int) -> None:
        self._max_bytes = max_bytes
        self._images: OrderedDict[str, StoredImage] = OrderedDict()
        self._lock = threading.Lock()

    def put(self, pixels: Rgba) -> StoredImage:
        height, width = pixels.shape[:2]
        key = image_id(width, height, pixels.tobytes())
        with self._lock:
            if key in self._images:
                self._images.move_to_end(key)
                return self._images[key]
            stored = StoredImage(key, width, height, pixels)
            self._images[key] = stored
            self._evict()
            return stored

    def get(self, key: str) -> StoredImage | None:
        with self._lock:
            stored = self._images.get(key)
            if stored is not None:
                self._images.move_to_end(key)
            return stored

    def _evict(self) -> None:
        total = sum(image.pixels.nbytes for image in self._images.values())
        # Keep at least the newest image, even when it alone is over the budget.
        while total > self._max_bytes and len(self._images) > 1:
            _, oldest = self._images.popitem(last=False)
            total -= oldest.pixels.nbytes
