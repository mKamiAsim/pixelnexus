# Architecture overview

PixelNexus has three parts that share one catalog.

| Part | Technology | Runs | Does |
|---|---|---|---|
| Studio | React, TypeScript, Vite | in the browser | the editor: canvas, panels, selections, browser filters in Web Workers, on-device models |
| Science engine | Python, FastAPI, NumPy, SciPy, scikit-image, OpenCV | on this computer, optional | filters that need scientific libraries, engine models with ONNX Runtime |
| Catalog | YAML with a JSON schema | at build time and in both parts | every filter, tool, model and AI task, with its parameters, maths and status |

## The catalog in the middle

`catalog/` is the single source of truth. The studio builds the Library, Properties, Inspector and Learn panels from it. The engine checks parameters against it. The docs take their facts from it. `tools/check_catalog.py` checks that every implemented entry names code and tests that exist. See [Filter catalog and registry](filter-catalog.md).

## One engine per filter

Each filter runs in exactly one place: the browser or the science engine. The studio sends science filters to the engine as jobs and shows their progress. Without the engine, browser filters still work, and science filters say the engine is needed. See [Execution model](execution-model.md).

## Inside the studio

- `web/src/core` is pure TypeScript: images, filters, masks, the pipeline, project files and the AI router. It never imports React, so it runs in workers, tests and Node.
- `web/src/state` holds the stores: documents with their history, filters, selection, settings.
- `web/src/app` and `web/src/panels` are the interface.
- `web/src/engine-client` talks to the engine.

See [Frontend architecture](frontend-architecture.md).

## Data flow of one filter

1. You choose a filter in the Library. Properties shows its parameters from the catalog.
2. A preview runs on the visible part, in workers or in the engine.
3. Apply runs the filter on the image, or on the selection's box with a halo.
4. The compositor blends the result through the selection.
5. The result becomes a history step, with the filter and its values.

See [Processing pipeline](processing-pipeline.md) and [Preview and rendering](preview-and-rendering.md).

## AI

AI tasks go through a router that knows each provider kind: engine models, on-device models, a remote engine or an external service. It asks for consent before anything leaves the device, logs every request, and labels every result. See [AI providers and consent](../user-guide/ai-providers.md).
