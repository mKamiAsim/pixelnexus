# API reference

PixelNexus has two programming interfaces: the HTTP API of the science engine, and the file formats of the studio.

## Engine HTTP API

The engine serves its API under `/api/v1` on `http://127.0.0.1:8765` by default. The table is generated from the OpenAPI description FastAPI builds from the code. The running engine also shows it interactively at `/api/v1/docs`.

--8<-- "engine-api.md"

### A filter job

1. Upload the image once as raw RGBA with `POST /api/v1/images?width=W&height=H`. The answer holds its id, the content hash.
2. Start the job with `POST /api/v1/jobs`, naming the filter, its parameters and the image id.
3. Follow its progress with server-sent events at `GET /api/v1/jobs/{id}/events`, or ask `GET /api/v1/jobs/{id}`.
4. Fetch the result with `GET /api/v1/jobs/{id}/result`, raw RGBA with `X-Width` and `X-Height` headers.
5. `DELETE /api/v1/jobs/{id}` cancels it and stops its process.

The studio's client for this is `web/src/engine-client/science.ts`.

## Studio file formats

| File | Format | Page |
|---|---|---|
| Pipeline | JSON, `pixelnexus-pipeline` version 1 | [Pipelines](../user-guide/pipelines.md) |
| Presets | JSON, `pixelnexus-presets` version 1 | [Panels](../user-guide/panels.md) |
| Project | ZIP with `project.json`, `pixelnexus-project` version 1 | [Projects](../user-guide/projects.md) |

## External AI services

The Generic HTTP contract for an AI service you build is on [Connecting an external API](../models/external-api.md).
