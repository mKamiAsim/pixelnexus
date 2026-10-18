"""Learned filters. Tiny ONNX models made here check the plumbing: tiles, padding, color, alpha,
scale and the freed input size. Where the real models are downloaded and exported, as on the
development machine, the real networks are checked too; elsewhere those tests are skipped."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pytest

from pixelnexus_engine import inference
from pixelnexus_engine.filters import learned
from pixelnexus_engine.models import model_entry
from pixelnexus_engine.params import check_params, resolve_params
from pixelnexus_engine.registry import common_params, find_catalog, science_entries

onnx = pytest.importorskip("onnx")
pytest.importorskip("onnxruntime")
from onnx import TensorProto, helper  # noqa: E402

CATALOG = find_catalog()
NOTHING = lambda _: None  # noqa: E731
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def cpu_only(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("PIXELNEXUS_DEVICE", "cpu")
    inference.device.cache_clear()
    yield
    inference.device.cache_clear()


def values(filter_id: str, **overrides: Any) -> dict[str, Any]:
    entry = next(e for e in science_entries(CATALOG) if e["id"] == filter_id)
    return check_params(resolve_params(entry, common_params(CATALOG)), overrides)


def save(
    tmp_path: Path,
    name: str,
    nodes: list[Any],
    inputs: list[Any],
    outputs: list[Any],
    inits: list[Any] | None = None,
) -> Path:
    graph = helper.make_graph(nodes, name, inputs, outputs, inits or [])
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], ir_version=10)
    path = tmp_path / f"{name}.onnx"
    onnx.save(model, str(path))
    return path


def image_io(name: str, channels: int, h: Any = None, w: Any = None) -> Any:
    return helper.make_tensor_value_info(name, TensorProto.FLOAT, [1, channels, h, w])


def scale_model(tmp_path: Path, channels: int, factor: float) -> Path:
    """y = factor * x."""
    k = helper.make_tensor("k", TensorProto.FLOAT, [], [factor])
    return save(tmp_path, f"scale{channels}", [helper.make_node("Mul", ["image", "k"], ["out"])],
                [image_io("image", channels)], [image_io("out", channels)], [k])  # fmt: skip


def rgba(rng: np.random.Generator, h: int, w: int, alpha: int = 255) -> np.ndarray:
    rgb = rng.integers(0, 256, (h, w, 3), dtype=np.uint8)
    return np.dstack([rgb, np.full((h, w), alpha, np.uint8)])


def test_tiles_with_enough_margin_equal_a_whole_run(tmp_path: Path) -> None:
    # Five 3 x 3 box convolutions reach 5 pixels.
    weight = helper.make_tensor("w", TensorProto.FLOAT, [3, 1, 3, 3], [1 / 9] * 27)
    nodes, name = [], "image"
    for i in range(5):
        nodes.append(helper.make_node("Conv", [name, "w"], [f"c{i}"], pads=[1, 1, 1, 1], group=3))
        name = f"c{i}"
    path = save(tmp_path, "box", nodes, [image_io("image", 3)], [image_io(name, 3)], [weight])
    run = learned.network(path)
    x = np.random.default_rng(0).random((3, 41, 53), dtype=np.float32)
    whole = run(x)
    np.testing.assert_allclose(learned.tiled(run, x, reach=5, tile=16), whole, atol=1e-6)
    assert np.abs(learned.tiled(run, x, reach=2, tile=16) - whole).max() > 1e-3


def test_dncnn_denoise_runs_on_rgb_and_keeps_alpha(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = scale_model(tmp_path, 3, 0.5)
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    image = rgba(np.random.default_rng(1), 30, 20, alpha=200)
    out = learned.dncnn(image, values("dncnn"), NOTHING)
    np.testing.assert_array_equal(out[..., :3], np.rint(image[..., :3] / 2).astype(np.uint8))
    assert (out[..., 3] == 200).all()


def test_dncnn_jpeg_works_on_the_brightness_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    chosen: list[str] = []
    path = scale_model(tmp_path, 1, 1.0)

    def fake_file(model_id: str) -> Path:
        chosen.append(model_id)
        return path

    monkeypatch.setattr(learned, "model_file", fake_file)
    image = rgba(np.random.default_rng(2), 25, 18)
    out = learned.dncnn(image, values("dncnn", task="jpeg"), NOTHING)
    assert chosen == ["dncnn3"]
    # An identity network on Y gives the image back, up to rounding.
    assert np.abs(out.astype(int) - image.astype(int)).max() <= 1


def test_ffdnet_pads_odd_sides_and_passes_the_noise_level(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sigma = helper.make_tensor_value_info("sigma", TensorProto.FLOAT, [1, 1, 1, 1])
    nodes = [helper.make_node("Add", ["image", "sigma"], ["out"])]
    path = save(tmp_path, "ffdnet", nodes, [image_io("image", 3), sigma], [image_io("out", 3)])
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    image = rgba(np.random.default_rng(3), 31, 17)
    image[..., :3] //= 2
    out = learned.ffdnet(image, values("ffdnet", sigma=51), NOTHING)
    assert out.shape == image.shape
    np.testing.assert_array_equal(out[..., :3], image[..., :3] + 51)


def test_super_resolution_scales_colors_and_alpha(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    scales = helper.make_tensor("s", TensorProto.FLOAT, [4], [1, 1, 4, 4])
    nodes = [helper.make_node("Resize", ["image", "", "s"], ["out"], mode="nearest")]
    path = save(tmp_path, "sr", nodes, [image_io("image", 3)], [image_io("out", 3)], [scales])
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    image = rgba(np.random.default_rng(4), 70, 45)
    out = learned.real_esrgan(image, values("real-esrgan"), NOTHING)
    assert out.shape == (280, 180, 4)
    np.testing.assert_array_equal(out[::4, ::4, :3], image[..., :3])
    assert (out[..., 3] == 255).all()


def test_style_models_run_at_any_size_and_mix_by_strength(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Like the zoo models: a fixed 224 x 224 input, and a weight also listed as an input.
    k = helper.make_tensor("k", TensorProto.FLOAT, [], [-1.0])
    b = helper.make_tensor("b", TensorProto.FLOAT, [], [255.0])
    nodes = [
        helper.make_node("Mul", ["input1", "k"], ["m"]),
        helper.make_node("Add", ["m", "b"], ["output1"]),
    ]
    k_input = helper.make_tensor_value_info("k", TensorProto.FLOAT, [])
    path = save(tmp_path, "style", nodes, [image_io("input1", 3, 224, 224), k_input],
                [image_io("output1", 3, 224, 224)], [k, b])  # fmt: skip
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    image = rgba(np.random.default_rng(5), 37, 59)
    full = learned.fast_style(image, values("fast-style"), NOTHING)
    np.testing.assert_array_equal(full[..., :3], 255 - image[..., :3])
    half = learned.fast_style(image, values("fast-style", strength=0.5), NOTHING)
    assert np.abs(half[..., :3].astype(int) - 127.5).max() <= 1


def test_the_model_follows_the_choice_and_the_catalog_lists_it() -> None:
    assert learned.chosen_model("fast-style", values("fast-style", style="candy")) == "style-candy"
    assert learned.chosen_model("dncnn", values("dncnn")) == "dncnn-color-blind"
    for model in ("dncnn3", "ffdnet-color", "realesr-general-x4v3", "edsr-x4", "fsrcnn-x2"):
        assert model_entry(model) is not None


def test_pytorch_weights_without_an_export_say_how_to_convert(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    folder = tmp_path / "dncnn3"
    folder.mkdir()
    (folder / "dncnn3.pth").write_bytes(b"x")
    monkeypatch.setattr(learned, "require", lambda _: folder / "dncnn3.pth")
    with pytest.raises(ValueError, match=r"tools/export_models\.py dncnn3"):
        learned.model_file("dncnn3")


def test_edge_networks_get_their_own_normalization(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The model returns its first input channel, scaled down so it fits the 0 to 1 output.
    k = helper.make_tensor("k", TensorProto.FLOAT, [], [1 / 512])
    starts = helper.make_tensor("st", TensorProto.INT64, [1], [0])
    ends = helper.make_tensor("en", TensorProto.INT64, [1], [1])
    axes = helper.make_tensor("ax", TensorProto.INT64, [1], [1])
    nodes = [
        helper.make_node("Slice", ["image", "st", "en", "ax"], ["first"]),
        helper.make_node("Mul", ["first", "k"], ["edges"]),
    ]
    path = save(
        tmp_path, "edges", nodes, [image_io("image", 3)], [image_io("edges", 1)],
        [k, starts, ends, axes],
    )  # fmt: skip
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    image = rgba(np.random.default_rng(7), 20, 30)
    hed = learned.learned_edges(image, values("learned-edges"), NOTHING)
    blue = image[..., 2].astype(np.float32)
    expected = np.clip(np.rint((blue - learned.HED_MEAN[0]) / 512 * 255), 0, 255)
    np.testing.assert_array_equal(hed[..., 0], expected)
    pidinet = learned.learned_edges(image, values("learned-edges", network="pidinet"), NOTHING)
    red = (image[..., 0] / 255 - learned.IMAGENET_MEAN[0]) / learned.IMAGENET_STD[0]
    expected_red = np.clip(np.rint(red / 512 * 255), 0, 255)
    assert np.abs(pidinet[..., 0].astype(float) - expected_red).max() <= 1


@pytest.mark.parametrize(
    "filter_id",
    ["dncnn", "ffdnet", "real-esrgan", "edsr", "srcnn", "fast-style", "learned-edges", "swinir",
     "swinir-sr", "restormer"],
)  # fmt: skip
def test_the_representations(filter_id: str) -> None:
    from pixelnexus_engine.registry import FILTERS

    stages = FILTERS[filter_id].representation(values(filter_id))["stages"]
    assert stages[-1]["name"] == "Model"
    for stage in stages:
        assert all(ch >= " " for ch in stage["formula"] + stage["note"])


# SwinIR: fixed-size tiles -----------------------------------------------------------------------


def fixed_model(
    tmp_path: Path, size: int, nodes: list[Any], out: str, scale: int = 1, inits: Any = None
) -> Path:
    """A model that accepts only size x size inputs, as the SwinIR exports do."""
    return save(tmp_path, f"fixed{size}x{scale}", nodes, [image_io("image", 3, size, size)],
                [image_io(out, 3, size * scale, size * scale)], inits)  # fmt: skip


def test_fixed_tiles_feed_only_full_tiles_and_keep_every_pixel(tmp_path: Path) -> None:
    k = helper.make_tensor("k", TensorProto.FLOAT, [], [0.5])
    path = fixed_model(tmp_path, 16, [helper.make_node("Mul", ["image", "k"], ["out"])], "out",
                       inits=[k])  # fmt: skip
    run = learned.network(path)
    x = np.random.default_rng(2).random((3, 37, 23), dtype=np.float32)
    # ONNX Runtime refuses any other input size, so every tile had to be 16 x 16.
    np.testing.assert_allclose(learned.fixed_tiles(run, x, 16, 4), x * 0.5, atol=1e-7)


def test_fixed_tiles_with_enough_margin_equal_a_whole_run_inside(tmp_path: Path) -> None:
    # Two 3 x 3 box convolutions reach 2 pixels. Away from the image edges, where the mirrored
    # padding and the zero padding of a whole run differ, the tiles must equal a whole run.
    weight = helper.make_tensor("w", TensorProto.FLOAT, [3, 1, 3, 3], [1 / 9] * 27)
    nodes = [
        helper.make_node("Conv", ["image", "w"], ["c0"], pads=[1, 1, 1, 1], group=3),
        helper.make_node("Conv", ["c0", "w"], ["c1"], pads=[1, 1, 1, 1], group=3),
    ]
    tiled_run = learned.network(fixed_model(tmp_path, 16, nodes, "c1", inits=[weight]))
    whole = save(tmp_path, "box2", nodes, [image_io("image", 3)], [image_io("c1", 3)], [weight])
    x = np.random.default_rng(3).random((3, 40, 50), dtype=np.float32)
    got = learned.fixed_tiles(tiled_run, x, 16, 2)
    np.testing.assert_allclose(got[:, 2:-2, 2:-2], learned.network(whole)(x)[:, 2:-2, 2:-2],
                               atol=1e-6)  # fmt: skip


def test_swinir_runs_on_rgb_in_its_tiles_and_keeps_alpha(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    k = helper.make_tensor("k", TensorProto.FLOAT, [], [0.5])
    path = fixed_model(tmp_path, 16, [helper.make_node("Mul", ["image", "k"], ["out"])], "out",
                       inits=[k])  # fmt: skip
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    monkeypatch.setitem(learned.SWINIR_TILE, "swinir-color-dn25", 16)
    monkeypatch.setattr(learned, "SWINIR_MARGIN", 4)
    image = rgba(np.random.default_rng(5), 30, 21, alpha=180)
    out = learned.swinir(image, values("swinir"), NOTHING)
    np.testing.assert_array_equal(out[..., :3], np.rint(image[..., :3] / 2).astype(np.uint8))
    assert (out[..., 3] == 180).all()


def test_swinir_sr_enlarges_two_times_with_alpha(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    scales = helper.make_tensor("s", TensorProto.FLOAT, [4], [1, 1, 2, 2])
    nodes = [helper.make_node("Resize", ["image", "", "s"], ["out"], mode="nearest")]
    path = fixed_model(tmp_path, 16, nodes, "out", scale=2, inits=[scales])
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    monkeypatch.setitem(learned.SWINIR_TILE, "swinir-lightweight-x2", 16)
    monkeypatch.setattr(learned, "SWINIR_MARGIN", 4)
    image = rgba(np.random.default_rng(6), 19, 26)
    out = learned.swinir_sr(image, values("swinir-sr"), NOTHING)
    assert out.shape == (38, 52, 4)
    np.testing.assert_array_equal(out[::2, ::2, :3], image[..., :3])
    assert (out[..., 3] == 255).all()


# Restormer ---------------------------------------------------------------------------------------


def multiple_of_8_model(tmp_path: Path, factor: float) -> Path:
    """y = factor * x, refusing sides that are not multiples of 8, as Restormer's shapes would."""
    k = helper.make_tensor("k", TensorProto.FLOAT, [], [factor])
    eight = helper.make_tensor("eight", TensorProto.INT64, [], [8])
    zero = helper.make_tensor("zero", TensorProto.INT64, [], [0])
    starts = helper.make_tensor("starts", TensorProto.INT64, [1], [2])
    ends = helper.make_tensor("ends", TensorProto.INT64, [1], [4])
    nodes = [
        helper.make_node("Shape", ["image"], ["shape"]),
        # Height and width only.
        helper.make_node("Slice", ["shape", "starts", "ends"], ["sides"]),
        helper.make_node("Mod", ["sides", "eight"], ["rest"]),
        helper.make_node("ReduceMax", ["rest"], ["worst"], keepdims=0),
        helper.make_node("Equal", ["worst", "zero"], ["ok"]),
        helper.make_node("Cast", ["ok"], ["okf"], to=TensorProto.FLOAT),
        # A side that is not a multiple of 8 gives 0 * x / 0 = NaN.
        helper.make_node("Div", ["k", "okf"], ["kk"]),
        helper.make_node("Mul", ["image", "kk"], ["out"]),
    ]
    return save(tmp_path, "mult8", nodes, [image_io("image", 3)], [image_io("out", 3)],
                [k, eight, zero, starts, ends])  # fmt: skip


def test_restormer_pads_to_multiples_of_8_and_crops_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = multiple_of_8_model(tmp_path, 0.5)
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    image = rgba(np.random.default_rng(7), 37, 29, alpha=90)
    out = learned.restormer(image, values("restormer"), NOTHING)
    assert out.shape == image.shape
    np.testing.assert_array_equal(out[..., :3], np.rint(image[..., :3] / 2).astype(np.uint8))
    assert (out[..., 3] == 90).all()


def test_restormer_clamps_and_averages_overlapping_tiles(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = multiple_of_8_model(tmp_path, 3.0)
    monkeypatch.setattr(learned, "model_file", lambda _: path)
    monkeypatch.setattr(learned, "RESTORMER_TILE", 16)
    monkeypatch.setattr(learned, "RESTORMER_OVERLAP", 4)
    image = rgba(np.random.default_rng(8), 40, 33)
    out = learned.restormer(image, values("restormer", task="deblur"), NOTHING)
    # Three times the values, clamped to 255, the same in every tile and overlap.
    expected = np.clip(image[..., :3].astype(float) * 3, 0, 255)
    np.testing.assert_array_equal(out[..., :3], expected.astype(np.uint8))


def test_averaged_tiles_cover_the_image_and_average_overlaps() -> None:
    x = np.random.default_rng(9).random((3, 40, 56), dtype=np.float32)
    calls: list[tuple[int, ...]] = []

    def run(chw: np.ndarray) -> np.ndarray:
        calls.append(chw.shape)
        return chw * 2

    np.testing.assert_allclose(learned.averaged_tiles(run, x, 24, 8), x * 2, rtol=1e-6)
    assert set(calls) == {(3, 24, 24)}


# Real models, where they are on disk ------------------------------------------------------------


def available(model_id: str) -> bool:
    folder = ROOT / "models" / model_id
    entry = model_entry(model_id) or {}
    wanted = (
        "model.onnx" if entry.get("format") == "pytorch" else Path(entry.get("sourceUrl", "x")).name
    )
    return (folder / wanted).is_file()


def real(model_id: str) -> Any:
    return pytest.mark.skipif(not available(model_id), reason=f"{model_id} is not downloaded here")


@pytest.fixture
def real_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PIXELNEXUS_MODELS_DIR", str(ROOT / "models"))


def noisy_scene(sigma: float) -> tuple[np.ndarray, np.ndarray]:
    rows, cols = np.mgrid[0:96, 0:128]
    clean = np.dstack(
        [
            60 + 120 * (cols > 64),
            90 + 0.8 * rows,
            160 - 60 * ((rows - 48) ** 2 + (cols - 30) ** 2 < 400),
        ]
    ).astype(float)
    noisy = clean + np.random.default_rng(6).normal(0, sigma, clean.shape)
    image = np.dstack([np.clip(np.rint(noisy), 0, 255), np.full((96, 128), 255)]).astype(np.uint8)
    return image, clean


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    return float(10 * np.log10(255**2 / np.mean((a.astype(float) - b) ** 2)))


@real("dncnn-color-blind")
def test_real_dncnn_removes_noise(real_models: None) -> None:
    image, clean = noisy_scene(25)
    out = learned.dncnn(image, values("dncnn"), NOTHING)
    assert psnr(out[..., :3], clean) > psnr(image[..., :3], clean) + 6


@real("dncnn-color-blind")
def test_real_dncnn_tiles_equal_a_whole_run(real_models: None) -> None:
    image, _ = noisy_scene(25)
    run = learned.network(learned.model_file("dncnn-color-blind"))
    x = learned.to_chw(image)
    np.testing.assert_allclose(
        learned.tiled(run, x, learned.REACH["dncnn"], tile=40), run(x), atol=1e-4
    )


@real("ffdnet-color")
def test_real_ffdnet_follows_the_noise_level(real_models: None) -> None:
    image, clean = noisy_scene(25)
    right = learned.ffdnet(image, values("ffdnet", sigma=25), NOTHING)
    low = learned.ffdnet(image, values("ffdnet", sigma=5), NOTHING)
    assert (
        psnr(right[..., :3], clean)
        > psnr(low[..., :3], clean) + 3
        > psnr(image[..., :3], clean) + 3
    )


@real("realesr-general-x4v3")
def test_real_esrgan_enlarges_four_times(real_models: None) -> None:
    image, _ = noisy_scene(0)
    assert learned.real_esrgan(image[:40, :50], values("real-esrgan"), NOTHING).shape == (
        160,
        200,
        4,
    )


@real("edsr-x4")
def test_real_edsr_enlarges_four_times(real_models: None) -> None:
    image, _ = noisy_scene(0)
    assert learned.edsr(image[:20, :30], values("edsr"), NOTHING).shape == (80, 120, 4)


@real("fsrcnn-x2")
def test_real_fsrcnn_enlarges_two_times(real_models: None) -> None:
    image, _ = noisy_scene(0)
    assert learned.srcnn(image[:30, :40], values("srcnn"), NOTHING).shape == (60, 80, 4)


@real("style-mosaic")
def test_real_style_runs_at_the_image_size(real_models: None) -> None:
    image, _ = noisy_scene(0)
    out = learned.fast_style(image[:50, :70], values("fast-style"), NOTHING)
    assert out.shape == (50, 70, 4) and out[..., :3].std() > 10


def edge_scene() -> np.ndarray:
    rows, cols = np.mgrid[0:200, 0:200]
    gray = np.where((rows - 100) ** 2 + (cols - 100) ** 2 < 60**2, 200, 50).astype(np.uint8)
    return np.dstack([gray, gray, gray, np.full_like(gray, 255)])


@real("hed-bsds")
@pytest.mark.parametrize("network", ["hed", "pidinet"])
def test_real_edge_networks_mark_the_outline(real_models: None, network: str) -> None:
    if network == "pidinet" and not available("pidinet"):
        pytest.skip("pidinet is not exported here")
    out = learned.learned_edges(edge_scene(), values("learned-edges", network=network), NOTHING)[
        ..., 0
    ]
    rows, cols = np.mgrid[0:200, 0:200]
    ring = np.abs(np.hypot(rows - 100, cols - 100) - 60) < 2
    assert out[ring].mean() > 4 * out[(rows - 100) ** 2 + (cols - 100) ** 2 < 30**2].mean() + 20


@real("hed-bsds")
def test_real_hed_tiles_on_the_pooling_grid_equal_a_whole_run(real_models: None) -> None:
    image = edge_scene()
    x = (image[..., 2::-1].astype(np.float32) - learned.HED_MEAN).transpose(2, 0, 1)
    run = learned.network(learned.model_file("hed-bsds"))
    whole = run(np.ascontiguousarray(x))
    tiles = learned.tiled(run, np.ascontiguousarray(x), learned.REACH["learned-edges"], tile=96)
    np.testing.assert_allclose(tiles, whole, atol=1e-3)


@real("swinir-color-dn25")
def test_real_swinir_removes_noise(real_models: None) -> None:
    image, clean = noisy_scene(25)
    out = learned.swinir(image, values("swinir"), NOTHING)
    assert psnr(out[..., :3], clean) > psnr(image[..., :3], clean) + 6


@real("swinir-lightweight-x2")
def test_real_swinir_sr_enlarges_two_times_and_beats_bicubic(real_models: None) -> None:
    import cv2

    image, clean = noisy_scene(0)
    # The model was trained on images shrunk with bicubic.
    small = cv2.resize(image, (64, 48), interpolation=cv2.INTER_CUBIC)
    out = learned.swinir_sr(small, values("swinir-sr"), NOTHING)
    assert out.shape == (96, 128, 4)
    bicubic = cv2.resize(small, (128, 96), interpolation=cv2.INTER_CUBIC)
    assert psnr(out[..., :3], clean) > psnr(bicubic[..., :3], clean)


@real("restormer-real-denoising")
def test_real_restormer_removes_noise(real_models: None) -> None:
    image, clean = noisy_scene(20)
    out = learned.restormer(image, values("restormer"), NOTHING)
    assert psnr(out[..., :3], clean) > psnr(image[..., :3], clean) + 6


@real("restormer-motion-deblurring")
def test_real_restormer_sharpens_motion_blur(real_models: None) -> None:
    import cv2

    _, clean = noisy_scene(0)
    kernel = np.full((1, 9), 1 / 9, np.float32)
    blurred = cv2.filter2D(clean.astype(np.float32), -1, kernel, borderType=cv2.BORDER_REFLECT)
    image = np.dstack([np.clip(np.rint(blurred), 0, 255), np.full(clean.shape[:2], 255)])
    image = image.astype(np.uint8)
    out = learned.restormer(image, values("restormer", task="deblur"), NOTHING)
    assert psnr(out[..., :3], clean) > psnr(image[..., :3], clean)
