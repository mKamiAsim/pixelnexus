# PixelNexus

PixelNexus is an image processing studio that runs in your web browser. It is made for teaching and learning image processing, and it also works for everyday photo edits.

Every filter comes with its formula, its kernel or operator, its limits and a plain explanation with live demos on your own image.

**Version 1.0.0.** 277 filters and 20 tools, each with passing tests. See the [release notes](docs/release-notes.md).

## Documentation and studio

| Link | What it holds |
|---|---|
| [Documentation](https://mkamiasim.github.io/pixelnexus/) | How to use and study with the studio, the mathematics, and one page for every filter. |
| [Studio](https://mkamiasim.github.io/pixelnexus/studio/) | The studio online. Nothing to install. |
| [The studio guide](https://mkamiasim.github.io/pixelnexus/user-guide/studio/) | A first session, the Study workspace and study paths. |
| [Configuration](https://mkamiasim.github.io/pixelnexus/getting-started/configuration/) | Every setting of the engine and the studio. |

The same pages are in the `docs/` folder of this repository.

## Quick start

You need Git, Node.js 22 or newer, and [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/mKamiAsim/pixelnexus.git
cd pixelnexus
corepack enable pnpm
pnpm install
uv sync --extra cpu
pnpm dev
```

Then open <http://localhost:5173>. On a computer with an NVIDIA GPU, use `uv sync --extra cuda` instead. Always pass one of the two extras: a plain `uv sync` removes the model runtime.

The studio can also be installed as an app from the browser menu. After the first visit it opens and runs browser filters without a network connection.

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the studio. |
| `uv run --extra cpu pixelnexus-engine` | Runs the optional science engine on `127.0.0.1:8765`. |
| `pnpm test` and `uv run --extra cpu pytest` | Runs the studio and Python tests. |
| `pnpm e2e` | Runs the browser tests. |
| `docker compose up --build` | Runs the studio and the engine in containers. |

The tests need Chromium the first time, and the browser tests also use Firefox and WebKit:

```bash
pnpm --filter @pixelnexus/web exec playwright install chromium firefox webkit
```

The full list is in `.github/workflows/ci.yml` and in the docs, under Getting started.

## Configuration

The studio keeps its preferences in your browser. Change them in **Edit > Preferences**. AI services are set in **Edit > AI providers**.

The engine reads environment variables. Copy `.env.example` to `.env`, edit it, and start the engine with `uv run --extra cpu --env-file .env pixelnexus-engine`. The most common settings:

| Variable | Default | What it sets |
|---|---|---|
| `PIXELNEXUS_ENGINE_HOST` | `127.0.0.1` | The address the engine listens on. |
| `PIXELNEXUS_ENGINE_PORT` | `8765` | The port the engine listens on. |
| `PIXELNEXUS_ALLOWED_ORIGINS` | the studio's local addresses | The web addresses that may call the engine. Add `https://mkamiasim.github.io` to use the online studio with your engine. |
| `PIXELNEXUS_DEVICE` | `auto` | Where AI models run: `auto`, `cpu` or `cuda`. |
| `PIXELNEXUS_MODELS_DIR` | `./models` | The folder for AI models that you download. |

The full list is on the [configuration page](https://mkamiasim.github.io/pixelnexus/getting-started/configuration/).

## Working on the docs

The docs build with MkDocs.

| Command | What it does |
|---|---|
| `uv run --extra cpu mkdocs serve` | Serves the docs at <http://127.0.0.1:8000> and reloads on changes. |
| `uv run --extra cpu mkdocs build --strict` | Builds the site into `site/`. Any warning stops the build. |
| `uv run --extra cpu python tools/gen_docs.py` | Writes the generated pages from the catalog. Add `--check` to only check them. |
| `uv run --extra cpu python tools/check_docs.py` | Checks that every filter has a page, with its status, formula, source and tests. |
| `uv run --extra cpu python tools/lint_prose.py` | Checks the writing style of the docs. |
| `pnpm --filter @pixelnexus/web check:figures` | After a build, checks every page at phone and desktop width. |

The site publishes the docs at the root and the studio at `/studio/`.

## Privacy

Images are processed on your device. The optional science engine runs on your own computer. AI tools are optional. An external AI service is used only after you allow it, every time.

## License

MIT. See [LICENSE](LICENSE).
