# Contributing

Thank you for helping. This page explains how work is done in PixelNexus.

## Before you start

1. Read `CLAUDE.md` and `planning/PLAN.md`, the current status and the handoff block.
2. Set up the machine as described in [Development environment](getting-started/development-environment.md).
3. Run the full check list in `.github/workflows/ci.yml` once, so you know the machine is ready.

## Rules that always apply

- The catalog in `catalog/` is the single source of truth for filters. Never hard-code filter lists, parameters, formulas or kernels anywhere else.
- Each filter has exactly one engine: browser or science.
- `web/src/core` is pure TypeScript and never imports React.
- A filter becomes `implemented-tested` only when its tests have run and passed.
- Never invent a kernel, formula, citation or benchmark number. Each one comes from code, a paper you can name, or a script that printed it.
- Docs and studio text follow `planning/WRITING_STYLE.md`: short sentences, plain American English, no em dashes.

## Branches and commits

All work happens on the `Development` branch. Commit messages name the phase and what changed. The owner merges `Development` into `main`, and approves every deploy.

## Adding things

- A filter: [Adding a filter](implementation/adding-a-filter.md).
- A model: [Model integration](models/integration.md). Its license is reviewed first.
- A docs page: add it to `mkdocs.yml`, then run `uv run mkdocs build --strict` and `uv run python tools/lint_prose.py`.

## Checks

Before you push, run at least:

```bash
pnpm lint
pnpm typecheck
pnpm test
uv run --extra cpu pytest
uv run python tools/check_catalog.py --summary
uv run python tools/gen_docs.py --check
uv run python tools/lint_prose.py
```
