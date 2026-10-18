import numpy as np

from make_fixtures import SYNTHETIC, build, object_16x16, same_data


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


def test_same_data_allows_only_last_bit_float_differences() -> None:
    assert same_data({"a": [1, 0.1 + 0.2]}, {"a": [1, 0.3]})
    assert same_data(-0.0024549378620508655, -0.0024549378621063767)
    assert not same_data(0.30001, 0.3)
    assert not same_data({"a": 1}, {"b": 1})
    assert not same_data([1, 2], [1, 2, 3])
    assert not same_data("1.0", 1.0)
