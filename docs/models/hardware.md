# Hardware needs

PixelNexus never needs a GPU. Every model also runs on the CPU, and the browser falls back to WebAssembly. A GPU only makes models faster.

## The local engine

- **CPU.** Install with `uv sync --extra cpu`. Every model runs.
- **NVIDIA GPU.** Install with `uv sync --extra cuda`. The engine uses CUDA only when a small test model really runs on it. Otherwise it uses the CPU and says why. `PIXELNEXUS_DEVICE` forces `cpu` or `cuda`. The status bar shows which one is used.

On the owner's computer, with an RTX 5090, the GPU ran the model filters 6 to 25 times faster than the CPU on a 1024 x 1024 image. Results on CUDA and the CPU differed by at most 1 to 2 levels out of 255.

| Model | GPU | CPU |
|---|--:|--:|
| DnCNN | 0.07 s | 0.45 s |
| Real-ESRGAN | 0.33 s | 2.81 s |
| HED | 0.09 s | 0.47 s |
| Fast style | 0.05 s | 0.55 s |
| BiRefNet lite | 0.13 s | 3.21 s |

These numbers come from one computer. Yours will differ.

## Disk space

Each model needs its own size on disk, listed in the [model reference](reference.md). The largest, BiRefNet lite, is about 224 MB. The engine also keeps image encoder results of click and box selection, up to `PIXELNEXUS_EMBEDDINGS_MB` (512 MB by default).

## The browser

On-device models run with ONNX Runtime Web. It uses WebGPU where the browser has a usable adapter, and WebAssembly on the CPU otherwise. The runtime itself is about 27 MB and loads only the first time a model runs. Models are kept in the browser's Cache Storage.
