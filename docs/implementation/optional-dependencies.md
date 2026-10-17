# Optional dependencies

The core of PixelNexus installs with no optional packages. Some filters need more, and they say so instead of failing.

## Engine extras

The engine's `pyproject.toml` defines these extras:

| Extra | Brings | For |
|---|---|---|
| `optional` | `pyrtools` | the steerable pyramid |
| `models` | ONNX Runtime (CPU) and `onnx` | learned filters and AI tasks |
| `cuda` | ONNX Runtime for NVIDIA GPUs with CUDA and cuDNN, and `onnx` | the same, on an NVIDIA GPU |

The root project offers `cpu` and `cuda`, which pick one of the two runtimes. They cannot be installed together. Always pass one of them:

```bash
uv sync --extra cpu
```

A plain `uv sync` removes ONNX Runtime.

## Status

A filter that needs an optional package has the status `optional-dependency`. When the package is missing, its module registers nothing, and the engine lists the filter as not available. The steerable pyramid works this way. A filter that needs a model has the status `optional-model`, and downloads its model only when you click Download. See [Model integration](model-integration.md).

## Rules

- A new package goes into an extra unless most users need it.
- Its license is checked first, and recorded on the filter's `dependencies` field and in [Dependencies and licenses](../reference/dependencies.md).
- The engine must start and run every other filter without it.
