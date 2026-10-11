# Running tests

PixelNexus has tests for the studio, the science engine, the catalog, the writing style and the docs. Run them from the repository root.

## Studio tests

| Command | What it runs |
|---|---|
| `pnpm test` | Unit and component tests with Vitest. |
| `pnpm test:coverage` | The same tests with a coverage report in `web/coverage/`. |
| `pnpm e2e` | End-to-end tests with Playwright against a production build. |

Playwright needs a browser the first time:

```bash
pnpm --filter @pixelnexus/web exec playwright install chromium
```

Unit tests sit next to the code they test, as `*.test.ts` or `*.test.tsx`. Tests that check build tools and shared data sit in `web/tests/unit/`. End-to-end tests sit in `web/tests/e2e/`.

## Python tests

```bash
uv run pytest
```

This runs the engine tests in `engine/tests/` and the tool tests in `tools/tests/`.

## Checks that are not tests

| Command | What it checks |
|---|---|
| `uv run python tools/check_catalog.py` | Every catalog file against the schema and the cross-reference rules. |
| `uv run python tools/lint_prose.py` | Docs and catalog text against the writing style. |
| `uv run python tools/make_fixtures.py --check` | Shared test images are up to date. |
| `uv run python tools/gen_docs.py --check` | Generated docs tables are up to date. |
| `uv run mkdocs build --strict` | The docs build with no broken links and no warnings. |
| `pnpm lint` and `pnpm typecheck` | Studio code style and types. |
| `uv run ruff check .` and `uv run mypy` | Python code style and types. |

## Shared test images

Browser filters are checked against SciPy, OpenCV and scikit-image. `tools/make_fixtures.py` writes small synthetic images to `web/tests/fixtures/synthetic.json`. Both the TypeScript and the Python tests use them.

| Name | Content |
|---|---|
| `gradient-5x5` | A ramp from 0 to 200 in steps of 50. |
| `checkerboard-8x8` | Squares of 2x2 pixels in black and white. |
| `object-16x16` | A bright 6x6 square on a dark background. |
| `salt-pepper-16x16` | Flat gray with 10 percent of pixels set to black or white. |

From Phase 3 on, the same script also writes one reference result per browser filter, with the tolerance it allows.

## Continuous integration

GitHub Actions runs all of the above on every push and pull request to `main`. The workflow is in `.github/workflows/ci.yml`.

A filter is marked "Implemented and tested" only after its tests have run and passed.
