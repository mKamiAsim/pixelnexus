# Model integration

This page explains how a learned model becomes part of PixelNexus, for developers who add one.

## The path of a model

1. **License review.** A candidate gets a row in `planning/MODEL_REVIEW.md`: task, license with a link, source, size and checksum. The owner approves the list before anything downloads.
2. **Catalog entry.** The model gets an entry in `catalog/models.yaml` with its pinned source URL, SHA-256, size, format, license, runtimes and paper. `tools/check_catalog.py` checks it.
3. **Download.** The engine downloads it on request, with progress and resume, into its models folder. The browser downloads ONNX models into its Cache Storage. Both keep a file only when its SHA-256 matches.
4. **Export, for some formats.** PyTorch and Caffe weights are converted to ONNX once, with `tools/export_models.py` in its own environment. The engine never imports PyTorch. An export is kept only when ONNX Runtime matches PyTorch.
5. **Code.** A filter that uses the model names it in its catalog entry (`model` or `modelChoices`) and runs in `engine/src/pixelnexus_engine/filters/learned.py`. An AI task lists its models in `catalog/ai-tasks.yaml` and runs in `filters/ai.py`, or in the browser in `web/src/core/ai/ondevice/tasks.ts`.

## Pre- and post-processing

Each model is run exactly as its own source runs it: the same resizing, scaling and normalization. The module docstring of `filters/ai.py` and `learned.py` names the source of each step, such as an ONNX demo at a pinned commit or a model card. Nothing is guessed. A difference from the source, such as tiling a large image, is marked as our choice.

## Where it runs

The engine runs ONNX models with ONNX Runtime, on CUDA when it really works and on the CPU otherwise. See [Hardware needs](hardware.md). The browser runs small ONNX models with ONNX Runtime Web, on WebGPU or WebAssembly.

## Tests

Every model has two kinds of tests:

- Tests with tiny dummy ONNX models, which run in CI without any download.
- Tests with the real model, which run only where it is downloaded, and are checked by hand on the owner's computer.

## What you see in the studio

- The Properties panel shows the model card with size, license and a Download button.
- The Inspector has a Model tab with the card and the real tensor shapes read from the files.
- The Learn panel has a Model pipeline demo with the steps from the catalog.
- Every result carries the AI result label.
