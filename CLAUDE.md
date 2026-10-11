# PixelNexus

A web-based image processing studio for teaching and everyday use. Classical filters, Photoshop-style selections, a maths Inspector and a Learn panel.

## Start here

1. Read `planning/PLAN.md`, section "Current status" and the progress log.
2. Filter scope, tiers and engines are in `planning/CATALOG.md`.
3. All docs and in-app text follow `planning/WRITING_STYLE.md`.
4. Source requirements are in `prompts/`. Decisions in PLAN.md section 2 win where they disagree.

## Rules that always apply

- The catalog in `catalog/` is the single source of truth for filters. Never hard-code filter lists, parameters, formulas or kernels anywhere else.
- Each filter has exactly one engine: browser (`web/src/core`) or science (`engine/`).
- `web/src/core` is pure TypeScript and never imports React.
- Never mark a filter `implemented-tested` until its tests have run and passed.
- Never invent a kernel, formula, citation or benchmark number.
- Text style: short sentences, easy American English, no em dashes, en dashes or `--` in prose.
- All work happens on the `Development` branch. Do not create a branch per phase. Write clear commit messages that name the phase and what changed. The owner merges `Development` into `main`.
- Commit and push to `Development` as work progresses (the owner asked for this so two PCs stay in step). Deploying to GitHub Pages still needs the owner's approval.
- The owner works on two PCs (home and office) and switches between them. So:
  - Keep the "Handoff" block in `planning/PLAN.md` current: branch, last finished step, next steps, open questions.
  - Update it and the progress log with every commit, not only at the end of a session.
  - Commit and push before a session ends. Never leave work only on one machine.
  - At the start of a session, run `git fetch` and `git status`, and pull the branch named in the Handoff block.

## Commands (run from the repository root)

- Studio: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format`, `pnpm e2e`
- Python: `uv sync`, `uv run pytest`, `uv run ruff check .`, `uv run ruff format .`, `uv run mypy`
- Engine: `uv run pixelnexus-engine`
- Catalog: `uv run python tools/check_catalog.py --summary`
- Prose: `uv run python tools/lint_prose.py`
- Generated files: `uv run python tools/make_fixtures.py`, `uv run python tools/gen_docs.py` (add `--check` to verify)
- Docs: `uv run mkdocs serve`, `uv run mkdocs build --strict`
- Full CI list: `.github/workflows/ci.yml`

## Gotchas

- TypeScript stays on 6.0.x. typescript-eslint does not support TypeScript 7 yet.
- MkDocs must stay below 2.0, and the docs must not use extra plugins or theme overrides (PLAN.md risk R4).
- OpenCV 5 moved BRISK and AKAZE to `cv2.xfeatures2d`.
- Tool parameters pass through JSON. Write special characters in Python source as `\N{EM DASH}` style escapes, not `\u` escapes.

## Setting up a new machine

Needs Git, Node.js 22 or newer, uv, and optionally Docker and the GitHub CLI (`gh`).

1. `git clone https://github.com/mKamiAsim/pixelnexus.git`, then `git checkout Development`.
2. `corepack enable pnpm`, then `pnpm install` and `uv sync`.
3. `pnpm --filter @pixelnexus/web exec playwright install chromium` (browser tests and E2E need it).
4. Run the full check list in `.github/workflows/ci.yml` to confirm the machine is ready.
5. Read "Current status" in `planning/PLAN.md` and continue from "Next action".

Memory notes from earlier sessions live on the first machine only. Everything they hold is also in `planning/` and this file.
