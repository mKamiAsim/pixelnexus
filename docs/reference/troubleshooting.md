# Troubleshooting

Common problems and what to do.

## The engine

**"Local engine: off" in the status bar.** The science engine is not running. Start it with `uv run --extra cpu pixelnexus-engine`, or `--extra cuda` on a computer with an NVIDIA GPU. Browser filters work without it.

**The studio cannot reach an engine that runs.** The studio's address must be in `PIXELNEXUS_ALLOWED_ORIGINS`, and `VITE_ENGINE_URL` must point at the engine. See [Configuration](../getting-started/configuration.md).

**Model filters say ONNX Runtime is missing.** A plain `uv sync` or `uv run` removes ONNX Runtime. Always pass `--extra cpu` or `--extra cuda`, for example `uv sync --extra cpu`.

**Models run on the CPU although there is an NVIDIA GPU.** The engine uses CUDA only when a small test model really runs on it. The status bar's tooltip and `uv run --extra cuda pixelnexus-engine device` say why it did not, for example a missing cuDNN. Install with `--extra cuda`, which brings CUDA and cuDNN.

**A model download stops with a checksum error.** The file did not match the SHA-256 in the catalog, so it was not kept. Try again. If it keeps failing, the source may have changed the file. Please report it.

## Opening files

**"The file is too large."** Raise the limits in **Edit > Preferences**, or reduce the image first.

**Colors look slightly different after opening.** The file had a color profile, which was converted to sRGB. A warning says so when the file opens.

## AI

**"No AI provider is set."** Choose one for the task in **Edit > AI providers**, or use the classical tool the message names.

**An external service fails with a network error.** The URL may be wrong, or the service refuses requests from a web page. Check the URL. Some services work only from a server.

**On-device models are slow.** The browser has no usable WebGPU adapter, so they run with WebAssembly on the CPU.

## Layout

**Panels are missing or in odd places.** **Window > Reset workspace** restores the current workspace. **Window > Workspace** picks another.

## Development

**E2E tests fail with a CORS error.** An engine of your own is running on port 8765. Stop it during the E2E tests.

**Tests fail at random with `page.goto` aborted.** Run fewer workers, such as `npx playwright test --workers=2` in `web`.
