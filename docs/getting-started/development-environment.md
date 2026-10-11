# Development environment

This page describes how the repository is laid out and which tool does what.

## Repository layout

| Folder | What it holds |
|---|---|
| `web/` | The studio. React, TypeScript and Vite. |
| `web/src/core/` | The browser engine. Pure TypeScript that never imports React. |
| `engine/` | The science engine. A Python package with a small FastAPI layer. |
| `catalog/` | The single source of truth for every filter, tool, glossary term and AI provider kind. |
| `tools/` | Python scripts that check the catalog, check the writing style and generate test data and docs fragments. |
| `docs/` | These docs. |
| `docker/` | Dockerfiles and the web server configuration. |
| `planning/` | The build plan, the catalog plan and the writing style guide. |

## The catalog comes first

Every filter starts as a YAML file in `catalog/filters/<family>/<id>.yaml`. The file holds the name, the parameters, the formula, the status and the Learn panel text.

The studio, the science engine, the docs and the tests all read these files. Nothing else may list filters, parameters, formulas or kernels. This keeps the app, the code and the docs in step.

The schema is in `catalog/schema/catalog.schema.json`. Two loaders check every file against it:

- The studio's Vite plugin in `web/build/catalog-plugin.ts`. A bad file stops the dev server with a clear message.
- The Python checker in `tools/check_catalog.py`. It also checks file names, links between entries, parameter ranges, formula placeholders, and the code, test and docs paths of implemented entries.

TypeScript types are generated from the schema with `pnpm gen`. The studio scripts run it for you.

## Commands

Run these from the repository root.

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the studio with live reload. |
| `pnpm build` | Builds the studio into `web/dist/`. |
| `pnpm preview` | Serves the built studio. |
| `pnpm lint` | Runs ESLint on the studio. |
| `pnpm typecheck` | Runs the TypeScript compiler. |
| `pnpm format` | Formats the studio code with Prettier. |
| `uv run pixelnexus-engine` | Starts the science engine. |
| `uv run ruff check .` | Lints the Python code. |
| `uv run ruff format .` | Formats the Python code. |
| `uv run mypy` | Type checks the Python code in strict mode. |
| `uv run python tools/check_catalog.py --summary` | Checks the catalog and prints counts. |
| `uv run python tools/lint_prose.py` | Checks the docs and catalog text against the writing style. |
| `uv run python tools/gen_docs.py` | Writes the generated docs tables in `docs/_generated/`. |
| `uv run python tools/make_fixtures.py` | Writes the shared test images in `web/tests/fixtures/`. |
| `uv run mkdocs serve` | Serves these docs with live reload. |

Tests have their own page: [Running tests](running-tests.md).

## Dependency versions

The project uses only releases that are at least 14 days old. This gives the wider community time to find broken releases first.

- pnpm enforces it with `minimumReleaseAge` in `pnpm-workspace.yaml`.
- uv enforces it with `exclude-newer` in `pyproject.toml`. That setting holds a fixed date. Move it forward when you update Python packages.

Lock files (`pnpm-lock.yaml` and `uv.lock`) are committed, so every install gets the same versions.

## Editor setup

Any editor works. These settings help:

- Format TypeScript with Prettier and Python with ruff on save.
- Show ESLint and ruff warnings in the editor.
- Use the TypeScript version from `web/node_modules`.
- Use the Python interpreter in `.venv/` at the repository root.
