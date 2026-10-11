import numpy as np

from make_fixtures import SYNTHETIC, build, object_16x16


def test_fixtures_are_deterministic() -> None:
    assert build() == build()


def test_synthetic_shapes_and_types() -> None:
    for make in SYNTHETIC.values():
        image = make()
        assert image.dtype == np.uint8
        assert image.ndim == 2


def test_object_position() -> None:
    image = object_16x16()
    rows, cols = np.nonzero(image == 220)
    assert (rows.min(), rows.max(), cols.min(), cols.max()) == (5, 10, 4, 9)
