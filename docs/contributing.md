# Contributing

Thank you for helping. This page explains how work is done in PixelNexus.

## Before you start

1. Read the [README](https://github.com/mKamiAsim/pixelnexus#readme) and the [catalog rules](getting-started/development-environment.md).
2. Set up the machine as described in [Development environment](getting-started/development-environment.md).
3. Run the full check list in `.github/workflows/ci.yml` once, so you know the machine is ready.

## Rules that always apply

- The catalog in `catalog/` is the single source of truth for filters. Never hard-code filter lists, parameters, formulas or kernels anywhere else.
- Each filter has exactly one engine: browser or science.
- `web/src/core` is pure TypeScript and never imports React.
- A filter becomes `implemented-tested` only when its tests have run and passed.
- Never invent a kernel, formula, citation or benchmark number. Each one comes from code, a paper you can name, or a script that printed it.
- Docs and studio text use short sentences, plain American English and no em dashes. `tools/lint_prose.py` checks this.

## Branches and commits

Nobody commits to `main` directly. To make a change:

1. Fork the repository, or create a branch from `main` if you have write access.
2. Make your change on that branch, with clear commit messages that say what changed.
3. Open a pull request into `main`.
4. All CI checks must pass, and a maintainer must approve the pull request before it is merged.

The owner approves every deploy.

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
