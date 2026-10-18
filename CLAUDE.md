# PixelNexus

A web-based image processing studio for teaching and everyday use. Classical filters, Photoshop-style selections, a maths Inspector and a Learn panel.

## Start here

1. Read `README.md` and `docs/contributing.md`.
2. Filter scope, tiers and engines are in the catalog, `catalog/`.
3. All docs and in-app text use short sentences and easy American English. `tools/lint_prose.py` checks this.

## Rules that always apply

- The catalog in `catalog/` is the single source of truth for filters. Never hard-code filter lists, parameters, formulas or kernels anywhere else.
- Each filter has exactly one engine: browser (`web/src/core`) or science (`engine/`).
- `web/src/core` is pure TypeScript and never imports React.
- Never mark a filter `implemented-tested` until its tests have run and passed.
- Never invent a kernel, formula, citation or benchmark number.
- Text style: short sentences, easy American English, no em dashes, en dashes or `--` in prose.
- `main` is protected. Work on a branch, open a pull request into `main`, and merge only when CI passes.
- Deploying to GitHub Pages needs the owner's approval.

## Commands (run from the repository root)

- Studio: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`, `pnpm e2e`
- Python: `uv sync --extra cpu` (or `--extra cuda` on a computer with an NVIDIA GPU), `uv run pytest`, `uv run ruff check .`, `uv run ruff format .`, `uv run mypy`
- Engine: `uv run pixelnexus-engine`
- Catalog: `uv run python tools/check_catalog.py --summary`
- Prose: `uv run python tools/lint_prose.py`
- Generated files: `uv run python tools/make_fixtures.py`, `uv run python tools/gen_docs.py` (add `--check` to verify)
- Docs: `uv run mkdocs serve`, `uv run mkdocs build --strict`
- Full CI list: `.github/workflows/ci.yml`

## Gotchas

- TypeScript stays on 6.0.x. typescript-eslint does not support TypeScript 7 yet.
- MkDocs must stay below 2.0, and the docs must not use extra plugins or theme overrides.
- OpenCV 5 moved BRISK and AKAZE to `cv2.xfeatures2d`.
- A plain `uv sync` removes ONNX Runtime. Always pass `--extra cpu` or `--extra cuda`. The two extras conflict, and the engine never requires CUDA.
- ONNX models built with the onnx package must set `ir_version=10`, or ONNX Runtime 1.30 rejects them.
- Tool parameters pass through JSON. Write special characters in Python source as `\N{EM DASH}` style escapes, not `\u` escapes.

## Setting up a new machine

Needs Git, Node.js 22 or newer, uv, and optionally Docker and the GitHub CLI (`gh`).

1. `git clone https://github.com/mKamiAsim/pixelnexus.git`.
2. `corepack enable pnpm`, then `pnpm install` and `uv sync --extra cpu` (`--extra cuda` with an NVIDIA GPU).
3. `pnpm --filter @pixelnexus/web exec playwright install chromium` (browser tests and E2E need it).
4. Run the full check list in `.github/workflows/ci.yml` to confirm the machine is ready.
