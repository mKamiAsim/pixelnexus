# Science engine integration

Science filters run in the local PixelNexus engine, a Python server built on FastAPI. This page explains how a filter becomes part of it. The architecture is in [Science engine](../architecture/science-engine.md).

## Register the filter

A filter is a function from an RGBA image and its parameters to a result:

```python
@register("my-filter", representation=my_filter_representation)
def my_filter(image: Rgba, params: dict[str, Any], progress: Progress) -> Rgba:
    ...
```

- The id must equal the catalog id.
- `params` arrive checked against the catalog: defaults filled in, ranges kept.
- `progress(share)` reports progress from 0 to 1. The studio shows it.
- `representation` builds what the Inspector shows, from the same code. It is served by `POST /api/v1/filters/{id}/representation`.
- `mask=True` marks a filter that reads the selection, such as inpainting.

Import the module in `engine/src/pixelnexus_engine/filters/__init__.py`, or the filter is not found.

## Channels and scope

Most filters work on planes. `filter_by_scope` in `pixelnexus_engine/planes.py` applies a plane function to RGB, to each channel, to brightness only or to color only, as the catalog's `channelScopes` allow, and keeps alpha.

## Results

A filter can return an image, a mask, labels or a table. Tables, such as the corners of a detector, go to the studio as JSON, and the image stays as it was. Every job runs in its own process, so a slow filter never blocks the API and can be stopped.

## Optional packages and models

A filter that needs a package outside the core list belongs to an extra, and its status is `optional-dependency`. A filter that needs a model names it with `model`. See [Optional dependencies](optional-dependencies.md) and [Model integration](model-integration.md).

## Docs material

`tools/engine_docs.py` runs the real engine code to make worked examples, operator facts and figure data for science filters, as `web/scripts/gen-filter-docs.mjs` does for browser filters.
