"""Export the approved PyTorch models of catalog/models.yaml to ONNX, once, on this machine.

The engine runs ONNX only and never imports PyTorch. This tool needs PyTorch, onnx, onnxscript and
onnxruntime. Run it in its own environment, which can reuse a system PyTorch:

    uv venv --system-site-packages --python /path/to/python-with-torch .venv-export
    VIRTUAL_ENV=.venv-export uv pip install onnx onnxscript "onnxruntime>=1.30"
    .venv-export/bin/python tools/export_models.py            # every downloaded model
    .venv-export/bin/python tools/export_models.py pidinet    # one model

First download the weights with `uv run pixelnexus-engine models download <id>`; their SHA-256 is
checked against the catalog. The network code is not copied into this repository. It is fetched
from each project at a pinned commit, checked against a SHA-256 below, and imported from a
temporary folder. The weights are read with weights_only=True, so no code in them runs.

Each export is checked against PyTorch at two image sizes before it is kept, and
models/<id>/export.json records how it was made.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import types
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
import torch
import yaml

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
KAIR = "https://raw.githubusercontent.com/cszn/KAIR/fc1732f4a4514e42ce15e5b3a1e18c828af47a1e"
ESRGAN = (
    "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/a4abfb2979a7bbff3f69f58f58ae324608821e27"
)
PIDINET = (
    "https://raw.githubusercontent.com/hellozhuo/pidinet/d21aa881ed9c628571636fad39acfe1fad517ebd"
)
CAFFE = "https://raw.githubusercontent.com/BVLC/caffe/9b891540183ddc834a02b2bd81b31afae71b2153"

# (url, path in the temporary package folder, SHA-256)
KAIR_FILES = [
    (f"{KAIR}/models/basicblock.py", "models/basicblock.py",
     "48406db8867394ac5ae233ebeec7711ac10acfc3a6bbf0072c33aa77d659b6fd"),
    (f"{KAIR}/models/network_dncnn.py", "models/network_dncnn.py",
     "8cee9e14df16da67f922ba96b9156b5bc5bcfc8c1cc2628906c871287d4b7c40"),
    (f"{KAIR}/models/network_ffdnet.py", "models/network_ffdnet.py",
     "8cc4c5eaddf2ee04dccacfd7d93714c72366f29d22850f843b8258bbc1573391"),
]  # fmt: skip
SWINIR_FILES = [
    (f"{KAIR}/models/network_swinir.py", "models/network_swinir.py",
     "682e605680a23416243214bcec83fd816b03f6c213e3b3b328563f56c6635bde"),
]  # fmt: skip
RESTORMER = (
    "https://raw.githubusercontent.com/swz30/Restormer/68dc6ac472db26f16361150cb7a96a1bc87da93f"
)
RESTORMER_FILES = [
    (f"{RESTORMER}/basicsr/models/archs/restormer_arch.py", "restormer_arch.py",
     "3be243fa3c8e2cb2c9459eeac062b04d6084dbcc328292dae1c3e52ba6f7434a"),
]  # fmt: skip
# SwinIR is exported for one tile size, since it builds its attention masks from the input size
# while it runs. The engine runs it in tiles of exactly this size (filters/learned.py).
SWINIR_TILE = {"swinir-lightweight-x2": 128, "swinir-color-dn25": 256}
ESRGAN_FILES = [
    (f"{ESRGAN}/realesrgan/archs/srvgg_arch.py", "srvgg_arch.py",
     "7419a75e789ca09295266563d74a6d7c08d6c24502af6b0a919b1811d0a0be59"),
]  # fmt: skip
PIDINET_FILES = [
    (f"{PIDINET}/models/pidinet.py", "pidinet_models/pidinet.py",
     "3adc1931e74df2d6d5def463f332098efd4ee06f5183d5b80cabeebb86bf7fef"),
    (f"{PIDINET}/models/ops.py", "pidinet_models/ops.py",
     "6336de7811099bb64b54c71f8b5414a6a567a6ab961c649e1cb66fc1f70bd8eb"),
    (f"{PIDINET}/models/config.py", "pidinet_models/config.py",
     "6c27da794ff832de01f0b6066718b4a306ac740e3252cdac96240ff3b2add827"),
    (f"{PIDINET}/models/convert_pidinet.py", "pidinet_models/convert_pidinet.py",
     "91eb119bbefab286d5ee0b71b497e20c78ef63e4f37e6b6026a61252fdb45002"),
]  # fmt: skip


CAFFE_FILES = [
    (f"{CAFFE}/src/caffe/proto/caffe.proto", "caffe.proto",
     "ce91ef2dea9acc73d6bee6cd960604e47d2a3472339269b8709f0d2a2a0eda43"),
]  # fmt: skip
# The mean of the HED training images, BGR, from the HED tutorial notebook.
HED_MEAN = (104.00698793, 116.66876762, 122.67891434)


def fetch(files: list[tuple[str, str, str]], folder: Path) -> None:
    """Write the upstream files into folder, after checking each SHA-256."""
    for url, relative, sha in files:
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != sha:
            raise ValueError(f"{url} does not match its pinned SHA-256.")
        target = folder / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        (target.parent / "__init__.py").touch()


def weights(path: Path) -> dict[str, torch.Tensor]:
    data = torch.load(path, map_location="cpu", weights_only=True)
    for key in ("params_ema", "params", "state_dict"):
        if isinstance(data, dict) and key in data:
            data = data[key]
            break
    return {name.removeprefix("module."): value for name, value in data.items()}


class Built:
    """A network ready for export, its example inputs and their names."""

    def __init__(
        self,
        net: torch.nn.Module,
        inputs: Callable[[int, int], tuple[torch.Tensor, ...]],
        names: list[str],
        output: str,
        even: bool = False,
        reference: Callable[[Any], Any] | None = None,
        fixed: int | None = None,
        multiple: int = 1,
    ) -> None:
        self.net = net.eval()
        self.inputs = inputs
        self.names = names
        self.output = output
        # FFDNet computes its padding with NumPy, so the export keeps the padding of the example.
        # The engine pads to even sides by repeating the edge, as FFDNet itself does, and crops.
        self.even = even
        # An outside reference to compare with, for weights that PyTorch did not train.
        self.reference = reference
        # A square input size that the export is fixed to, for networks that need one.
        self.fixed = fixed
        # Input sides must be multiples of this, for networks that downsample.
        self.multiple = multiple


def build_dncnn(folder: Path, channels: int, pth: Path) -> Built:
    fetch(KAIR_FILES, folder)
    from models.network_dncnn import DnCNN  # type: ignore[import-not-found]

    # KAIR's own test script: 20 layers for the blind and DnCNN-3 models, batch norm merged.
    net = DnCNN(in_nc=channels, out_nc=channels, nc=64, nb=20, act_mode="R")
    net.load_state_dict(weights(pth), strict=True)
    return Built(net, lambda h, w: (torch.rand(1, channels, h, w),), ["image"], "restored")


def build_ffdnet(folder: Path, pth: Path) -> Built:
    fetch(KAIR_FILES, folder)
    from models.network_ffdnet import FFDNet  # type: ignore[import-not-found]

    # KAIR's own test script: 96 channels and 12 layers for color.
    net = FFDNet(in_nc=3, out_nc=3, nc=96, nb=12, act_mode="R")
    net.load_state_dict(weights(pth), strict=True)
    return Built(
        net,
        lambda h, w: (torch.rand(1, 3, h, w), torch.full((1, 1, 1, 1), 25 / 255)),
        ["image", "sigma"],
        "restored",
        even=True,
    )


def build_realesrgan(folder: Path, pth: Path) -> Built:
    # srvgg_arch.py registers itself with BasicSR. A stand-in registry is enough to import it.
    registry = types.ModuleType("basicsr.utils.registry")
    registry.ARCH_REGISTRY = types.SimpleNamespace(register=lambda: lambda cls: cls)  # type: ignore[attr-defined]
    for name in ("basicsr", "basicsr.utils"):
        sys.modules.setdefault(name, types.ModuleType(name))
    sys.modules["basicsr.utils.registry"] = registry
    fetch(ESRGAN_FILES, folder)
    from srvgg_arch import SRVGGNetCompact  # type: ignore[import-not-found]

    # inference_realesrgan.py: realesr-general-x4v3 has 32 convolutions.
    net = SRVGGNetCompact(
        num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type="prelu"
    )
    net.load_state_dict(weights(pth), strict=True)
    return Built(net, lambda h, w: (torch.rand(1, 3, h, w),), ["image"], "enlarged")


def stand_in_timm() -> None:
    """network_swinir.py imports three helpers from timm. DropPath is the identity outside
    training, and trunc_normal_ only sets starting weights, which the checkpoint replaces."""
    layers = types.ModuleType("timm.models.layers")
    layers.DropPath = lambda *args, **kwargs: torch.nn.Identity()  # type: ignore[attr-defined]
    layers.to_2tuple = lambda x: x if isinstance(x, tuple) else (x, x)  # type: ignore[attr-defined]
    layers.trunc_normal_ = lambda tensor, **kwargs: tensor  # type: ignore[attr-defined]
    for name in ("timm", "timm.models"):
        sys.modules.setdefault(name, types.ModuleType(name))
    sys.modules["timm.models.layers"] = layers


def build_swinir(folder: Path, pth: Path, model_id: str) -> Built:
    stand_in_timm()
    fetch(SWINIR_FILES, folder)
    from models.network_swinir import SwinIR  # type: ignore[import-not-found]

    # The settings of main_test_swinir.py in the SwinIR repository, commit 6545850, for the
    # tasks lightweight_sr and color_dn.
    if model_id == "swinir-lightweight-x2":
        net = SwinIR(upscale=2, in_chans=3, img_size=64, window_size=8, img_range=1.0,
                     depths=[6, 6, 6, 6], embed_dim=60, num_heads=[6, 6, 6, 6], mlp_ratio=2,
                     upsampler="pixelshuffledirect", resi_connection="1conv")  # fmt: skip
        output = "enlarged"
    else:
        net = SwinIR(upscale=1, in_chans=3, img_size=128, window_size=8, img_range=1.0,
                     depths=[6] * 6, embed_dim=180, num_heads=[6] * 6, mlp_ratio=2,
                     upsampler="", resi_connection="1conv")  # fmt: skip
        output = "restored"
    net.load_state_dict(weights(pth), strict=True)
    tile = SWINIR_TILE[model_id]
    return Built(net, lambda h, w: (torch.rand(1, 3, h, w),), ["image"], output, fixed=tile)


def build_restormer(folder: Path, pth: Path, layer_norm: str) -> Built:
    # restormer_arch.py imports einops, which the export environment needs (MIT License).
    fetch(RESTORMER_FILES, folder)
    from restormer_arch import Restormer  # type: ignore[import-not-found]

    # The network_g settings of Denoising/Options/RealDenoising_Restormer.yml and
    # Motion_Deblurring/Options/Deblurring_Restormer.yml at commit 68dc6ac. They differ only in
    # the layer norm.
    net = Restormer(inp_channels=3, out_channels=3, dim=48, num_blocks=[4, 6, 6, 8],
                    num_refinement_blocks=4, heads=[1, 2, 4, 8], ffn_expansion_factor=2.66,
                    bias=False, LayerNorm_type=layer_norm, dual_pixel_task=False)  # fmt: skip
    net.load_state_dict(weights(pth), strict=True)
    # Three downsamplings by 2: the engine pads every tile to a multiple of 8.
    return Built(net, lambda h, w: (torch.rand(1, 3, h, w),), ["image"], "restored", multiple=8)


class FusedEdges(torch.nn.Module):  # type: ignore[misc]
    """PiDiNet returns five edge maps. The last is the fused one the paper evaluates."""

    def __init__(self, net: torch.nn.Module) -> None:
        super().__init__()
        self.net = net

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        output: torch.Tensor = self.net(x)[-1]
        return output


def build_pidinet(folder: Path, pth: Path) -> Built:
    fetch(PIDINET_FILES, folder)
    from pidinet_models.convert_pidinet import convert_pidinet  # type: ignore[import-not-found]
    from pidinet_models.pidinet import pidinet_converted  # type: ignore[import-not-found]

    # The README's table5_pidinet: --config carv4 --sa --dil, converted to vanilla convolutions.
    args = types.SimpleNamespace(config="carv4", sa=True, dil=True)
    net = pidinet_converted(args)
    net.load_state_dict(convert_pidinet(weights(pth), "carv4"), strict=True)
    return Built(FusedEdges(net), lambda h, w: (torch.rand(1, 3, h, w),), ["image"], "edges")


class HED(torch.nn.Module):  # type: ignore[misc]
    """HED as its deploy.prototxt defines it: VGG16 with a first padding of 35, five side
    outputs upsampled by deconvolution and cropped to the input, and a fused 1 x 1 convolution.
    Caffe's pooling rounds up, and the crops are centered, as OpenCV's HED sample does. The
    input is BGR from 0 to 255 minus HED_MEAN. The output is the fused edge probability."""

    def __init__(self) -> None:
        super().__init__()
        nn = torch.nn
        # (name, input channels, output channels) of the VGG16 trunk.
        trunk = [
            ("conv1_1", 3, 64), ("conv1_2", 64, 64), ("conv2_1", 64, 128), ("conv2_2", 128, 128),
            ("conv3_1", 128, 256), ("conv3_2", 256, 256), ("conv3_3", 256, 256),
            ("conv4_1", 256, 512), ("conv4_2", 512, 512), ("conv4_3", 512, 512),
            ("conv5_1", 512, 512), ("conv5_2", 512, 512), ("conv5_3", 512, 512),
        ]  # fmt: skip
        self.convs = nn.ModuleDict(
            {
                n.replace("_", "-"): nn.Conv2d(i, o, 3, padding=35 if n == "conv1_1" else 1)
                for n, i, o in trunk
            }
        )
        self.dsn = nn.ModuleList(nn.Conv2d(c, 1, 1) for c in (64, 128, 256, 512, 512))
        self.up = nn.ModuleList(nn.ConvTranspose2d(1, 1, 2 * f, stride=f) for f in (2, 4, 8, 16))
        self.fuse = nn.Conv2d(5, 1, 1)
        self.pool = nn.MaxPool2d(2, 2, ceil_mode=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        height, width = x.shape[2], x.shape[3]
        stages = [["conv1-1", "conv1-2"], ["conv2-1", "conv2-2"], ["conv3-1", "conv3-2", "conv3-3"],
                  ["conv4-1", "conv4-2", "conv4-3"], ["conv5-1", "conv5-2", "conv5-3"]]  # fmt: skip
        sides = []
        h = x
        for index, stage in enumerate(stages):
            if index:
                h = self.pool(h)
            for name in stage:
                h = torch.relu(self.convs[name](h))
            side = self.dsn[index](h)
            if index:
                side = self.up[index - 1](side)
            top = (side.shape[2] - height) // 2
            left = (side.shape[3] - width) // 2
            sides.append(side[:, :, top : top + height, left : left + width])
        output: torch.Tensor = torch.sigmoid(self.fuse(torch.cat(sides, dim=1)))
        return output


def build_hed(folder: Path, model: Path) -> Built:
    import subprocess

    fetch(CAFFE_FILES, folder)
    subprocess.run(
        [sys.executable, "-m", "grpc_tools.protoc", f"-I{folder}", f"--python_out={folder}",
         str(folder / "caffe.proto")],
        check=True,
    )  # fmt: skip
    import caffe_pb2  # type: ignore[import-not-found]

    net = caffe_pb2.NetParameter()
    net.ParseFromString(model.read_bytes())
    blobs = {
        layer.name: [torch.tensor(list(b.data), dtype=torch.float32).reshape(tuple(b.shape.dim))
                     for b in layer.blobs]
        for layer in net.layer if layer.blobs
    }  # fmt: skip
    hed = HED()
    state = {}
    for name in hed.convs:
        weight, bias = blobs[name.replace("-", "_")]
        state[f"convs.{name}.weight"], state[f"convs.{name}.bias"] = weight, bias
    for i in range(5):
        state[f"dsn.{i}.weight"], state[f"dsn.{i}.bias"] = blobs[f"score-dsn{i + 1}"]
    for i, f in enumerate((2, 4, 8, 16)):
        state[f"up.{i}.weight"], state[f"up.{i}.bias"] = blobs[f"upsample_{f}"]
    state["fuse.weight"], state["fuse.bias"] = blobs["new-score-weighting"]
    hed.load_state_dict(state, strict=True)
    mean = torch.tensor(HED_MEAN).view(1, 3, 1, 1)
    return Built(
        hed, lambda h, w: (torch.rand(1, 3, h, w) * 255 - mean,), ["image"], "edges",
        reference=lambda array: opencv_hed(model, array),
    )  # fmt: skip


def opencv_hed(model: Path, array: Any) -> Any:
    """The reference: OpenCV 4 runs the Caffe model, with the centered crop of its HED sample."""
    import cv2 as opencv

    # OpenCV 4 in the export environment. Its stubs differ from the engine's OpenCV 5.
    cv2: Any = opencv

    class CropLayer:
        def __init__(self, params: Any, blobs: Any) -> None:
            self.top = self.left = 0

        def getMemoryShapes(self, inputs: Any) -> Any:
            source, target = inputs[0], inputs[1]
            self.top, self.left = (source[2] - target[2]) // 2, (source[3] - target[3]) // 2
            return [[source[0], source[1], target[2], target[3]]]

        def forward(self, inputs: Any) -> Any:
            height, width = inputs[1].shape[2:]
            return [inputs[0][:, :, self.top : self.top + height, self.left : self.left + width]]

    # OpenCV allows one registration per layer type in a process.
    cv2.dnn_unregisterLayer("Crop")
    cv2.dnn_registerLayer("Crop", CropLayer)
    net = cv2.dnn.readNetFromCaffe(str(model.parent / "deploy.prototxt"), str(model))
    net.setInput(array)
    return net.forward()


TEMPORARY_PACKAGES = {
    "models",
    "pidinet_models",
    "srvgg_arch",
    "caffe_pb2",
    "timm",
    "restormer_arch",
}

# Formats the engine cannot run directly. OpenCV 5 dropped its Caffe importer.
EXPORTED = ("pytorch", "caffe")

BUILDERS: dict[str, Callable[[Path, Path], Built]] = {
    "dncnn-color-blind": lambda folder, pth: build_dncnn(folder, 3, pth),
    "dncnn3": lambda folder, pth: build_dncnn(folder, 1, pth),
    "ffdnet-color": build_ffdnet,
    "realesr-general-x4v3": build_realesrgan,
    "pidinet": build_pidinet,
    "hed-bsds": build_hed,
    "swinir-lightweight-x2": lambda folder, pth: build_swinir(folder, pth, "swinir-lightweight-x2"),
    "swinir-color-dn25": lambda folder, pth: build_swinir(folder, pth, "swinir-color-dn25"),
    "restormer-real-denoising": lambda folder, pth: build_restormer(folder, pth, "BiasFree"),
    "restormer-motion-deblurring": lambda folder, pth: build_restormer(folder, pth, "WithBias"),
}


def export(model_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    folder = MODELS / model_id
    pth = folder / Path(entry["sourceUrl"]).name
    if not pth.is_file():
        raise FileNotFoundError(
            f"Download it first: uv run pixelnexus-engine models download {model_id}"
        )
    if hashlib.sha256(pth.read_bytes()).hexdigest() != entry["sha256"]:
        raise ValueError(f"{pth.name} does not match the catalog. Download it again.")
    with tempfile.TemporaryDirectory() as temporary:
        # Each model imports its own copy of the upstream code from a fresh folder.
        for name in [m for m in sys.modules if m.split(".")[0] in TEMPORARY_PACKAGES]:
            del sys.modules[name]
        sys.path.insert(0, temporary)
        try:
            built = BUILDERS[model_id](Path(temporary), pth)
        finally:
            sys.path.remove(temporary)
        target = folder / "model.onnx"
        size = built.fixed
        example = built.inputs(size, size) if size else built.inputs(64, 96)
        # The check sizes and the example are multiples of 8 and 16, which suits every network.
        axes = {name: {2: "height", 3: "width"} for name in built.names if name != "sigma"}
        axes[built.output] = {2: "height", 3: "width"}
        if size:
            axes = {}
        with torch.no_grad():
            torch.onnx.export(
                built.net,
                example,
                str(target),
                input_names=built.names,
                output_names=[built.output],
                dynamic_axes=axes,
                opset_version=17,
                dynamo=False,
            )
        session = ort.InferenceSession(str(target), providers=["CPUExecutionProvider"])
        errors = []
        sizes = ((48, 80), (96, 62)) if built.even else ((48, 80), (97, 61))
        if built.multiple > 1:
            sizes = ((48, 80), (96, 64))
        if size:
            # A fixed size is checked twice, with two random images.
            sizes = ((size, size), (size, size))
        for h, w in sizes:
            inputs = built.inputs(h, w)
            with torch.no_grad():
                expected = built.net(*inputs).numpy()
            if built.reference is not None:
                outside = built.reference(inputs[0].numpy())
                errors.append(float(np.abs(outside - expected).max()))
            feed = {name: t.numpy() for name, t in zip(built.names, inputs, strict=True)}
            got = session.run(None, feed)[0]
            errors.append(float(np.abs(got - expected).max()))
        if max(errors) > 1e-3:
            target.unlink()
            raise ValueError(
                f"The ONNX export of {model_id} differs from PyTorch by {max(errors)}."
            )
    record = {
        "model": model_id,
        "source": pth.name,
        "sourceSha256": entry["sha256"],
        "onnxSha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "torch": torch.__version__,
        "opset": 17,
        "inputs": built.names,
        "output": built.output,
        "evenSize": built.even,
        "fixedSize": built.fixed,
        "sideMultiple": built.multiple,
        "maxDifferenceFromPyTorch": max(errors),
        "reference": "OpenCV 4 Caffe importer" if built.reference is not None else None,
    }
    (folder / "export.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return record


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("ids", nargs="*", help="model ids; default: every downloaded one")
    args = parser.parse_args(argv)
    catalog = yaml.safe_load((ROOT / "catalog" / "models.yaml").read_text(encoding="utf-8"))
    entries = {m["id"]: m for m in catalog["models"] if m.get("format") in EXPORTED}
    unknown = [i for i in args.ids if i not in entries]
    if unknown:
        print(
            f"Not PyTorch models in the catalog: {', '.join(unknown)}. "
            f"Choose from {', '.join(entries)}."
        )
        return 1
    chosen = args.ids or [i for i in entries if (MODELS / i).is_dir()]
    failed = 0
    for model_id in chosen:
        try:
            record = export(model_id, entries[model_id])
            print(
                f"{model_id}: exported, largest difference from PyTorch "
                f"{record['maxDifferenceFromPyTorch']:.2e}"
            )
        except Exception as error:
            failed += 1
            print(f"{model_id}: {error}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
