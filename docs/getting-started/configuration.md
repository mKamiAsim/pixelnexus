# Configuration

PixelNexus works without any configuration. Change settings only when the defaults do not fit.

## Where settings live

All settings are environment variables. The file `.env.example` at the repository root lists every one of them with its default.

To change a setting, copy the example file and edit the copy:

```bash
cp .env.example .env
```

Never commit `.env`. Git already ignores it.

- **The studio** reads `.env` from the repository root when you run `pnpm dev` or `pnpm build`. Only names that start with `VITE_` reach the browser.
- **The science engine** reads the environment of its own process. Load the file when you start it:

```bash
uv run --env-file .env pixelnexus-engine
```

## Science engine settings

| Variable | Default | Meaning |
|---|---|---|
| `PIXELNEXUS_ENGINE_HOST` | `127.0.0.1` | Network address the engine listens on. Keep `127.0.0.1` unless you know you need more. |
| `PIXELNEXUS_ENGINE_PORT` | `8765` | Port the engine listens on. |
| `PIXELNEXUS_ALLOWED_ORIGINS` | the studio's local addresses | Comma-separated list of web addresses that may call the engine. Browsers do not let any other site read the engine's answers. |
| `PIXELNEXUS_MAX_UPLOAD_MB` | `256` | Largest accepted upload, in megabytes. Images travel as raw pixels, 4 bytes each, so a 50 megapixel image needs 200 MB. |
| `PIXELNEXUS_MAX_PIXELS` | `50000000` | Largest accepted image, as width times height. This blocks images that are small as files but huge when decoded. |
| `PIXELNEXUS_MODELS_DIR` | `./models` | Folder for AI models that you choose to download. Used from Phase 7. |
| `PIXELNEXUS_MAX_WORKERS` | half the processor cores, at least 1 | How many filter jobs run at the same time. Each job runs in its own process. |
| `PIXELNEXUS_CACHE_MB` | `1024` | Memory for uploaded images, in megabytes. The image used least recently is dropped first. |
| `PIXELNEXUS_CATALOG_DIR` | found from the working folder | The `catalog/filters` folder. The engine checks every job against the catalog. When you start it from the repository, it finds the folder by itself. |

The engine reports its limits at `/api/v1/info`. It never reports file paths.

## Studio settings

| Variable | Default | Meaning |
|---|---|---|
| `VITE_ENGINE_URL` | `http://127.0.0.1:8765` | Address of the science engine, as seen from the browser. Used from Phase 6. |

## Docker

`compose.yaml` sets the allowed origins for the containers. The studio container runs at port 8080, so the engine accepts calls from `http://localhost:8080` and `http://127.0.0.1:8080`.
