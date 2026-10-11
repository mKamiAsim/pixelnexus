# PixelNexus

PixelNexus is an image processing studio that runs in your web browser. It is made for teaching and learning image processing, and it also works for everyday photo edits.

Every filter comes with its formula, its kernel or operator, its limits and a plain explanation with live demos on your own image.

**Status:** early development. The foundation is in place. The studio workspace arrives in Phase 2. See [planning/PLAN.md](planning/PLAN.md).

## Quick start

You need Git, Node.js 22 or newer, and [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/mKamiAsim/pixelnexus.git
cd pixelnexus
corepack enable pnpm
pnpm install
uv sync
pnpm dev
```

Then open <http://localhost:5173>.

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the studio. |
| `uv run pixelnexus-engine` | Runs the optional science engine on `127.0.0.1:8765`. |
| `pnpm test` and `uv run pytest` | Runs the studio and Python tests. |
| `uv run mkdocs serve` | Serves the docs at <http://127.0.0.1:8000>. |
| `docker compose up --build` | Runs the studio and the engine in containers. |

The full list is in the docs, under Getting started.

## Documentation

The docs live in `docs/` and build with MkDocs. They explain the mathematics, the code and the tests for every filter.

```bash
uv run mkdocs serve
```

## Privacy

Images are processed on your device. The optional science engine runs on your own computer. AI tools are optional. An external AI service is used only after you allow it, every time.

## License

MIT. See [LICENSE](LICENSE).
