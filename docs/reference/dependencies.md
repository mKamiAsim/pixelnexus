# Dependencies and licenses

PixelNexus uses these packages at run time. Versions and licenses are read from the installed packages by `tools/gen_licenses.py`, so they are not typed by hand. Run it again after you change a dependency.

--8<-- "dependencies.md"

`onnxruntime` and `onnxruntime-gpu` are two builds of the same ONNX Runtime project. A computer installs one of them: the `cpu` extra or the `cuda` extra.

## Models

The learned models are not part of PixelNexus. Each downloads from its own source, under its own license. Two allow non-commercial use only. See the [model reference](../models/reference.md).

## Development tools

Build and test tools, such as Vite, Vitest, Playwright, ESLint, Ruff, mypy and MkDocs, are listed in `web/package.json` and the `pyproject.toml` files. They are not shipped with the studio or the engine.
