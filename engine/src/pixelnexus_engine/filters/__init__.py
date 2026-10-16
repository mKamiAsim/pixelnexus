"""Engine filters. Each module registers its filters with ``register`` when it is imported.

``load_filters`` in registry.py imports this package, in the server and in every job process.
"""

from pixelnexus_engine.filters import (  # noqa: F401, registers by import
    artifacts,
    blobs,
    contours,
    deriche,
    directional,
    edge_preserving,
    hough,
    inpainting,
    interactive,
    keypoints,
    matched,
    mser,
    phase,
    plugplay,
    radon,
    restoration,
    ridges,
    robust,
    segmentation,
    shen_castan,
    split_merge,
    steerable,
    structured_edge,
    superresolution,
    surf,
    susan,
    texture,
    tone,
    tree_morphology,
    wavelets,
)
