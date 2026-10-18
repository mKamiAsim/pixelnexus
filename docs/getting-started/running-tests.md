# Running tests

PixelNexus has tests for the studio, the science engine, the catalog, the writing style and the docs. Run them from the repository root.

## Studio tests

| Command | What it runs |
|---|---|
| `pnpm test` | Unit, component and browser tests with Vitest. |
| `pnpm test:coverage` | The same tests with a coverage report in `web/coverage/`. |
| `pnpm e2e` | End-to-end tests with Playwright against a production build. |

Vitest runs two groups of tests:

- **unit** runs in Node.js. It covers maths, catalog rules and components.
- **browser** runs in a real Chromium. It covers code that needs browser features, such as Web Workers, image decoding and WebGL. These files end in `.browser.test.ts`.

The browser tests need Chromium the first time. The end-to-end tests also run in Firefox and WebKit:

```bash
pnpm --filter @pixelnexus/web exec playwright install chromium firefox webkit
```

On Linux, WebKit also needs some system libraries. When they are missing, Playwright prints the command that installs them. To run the end-to-end tests in one browser, add `--project`, for example `pnpm e2e --project=firefox`.

Unit tests sit next to the code they test, as `*.test.ts` or `*.test.tsx`. Tests that check build tools and shared data sit in `web/tests/unit/`. End-to-end tests sit in `web/tests/e2e/`.

### End-to-end tests

`pnpm e2e` builds the studio, serves the build and drives it in Chromium, Firefox and WebKit. The tests in `web/tests/e2e/` cover:

- Opening three images, zooming, panning, every compare mode, and exporting in PNG, JPEG, WebP and TIFF, with a check of each file's first bytes.
- A resized export, checked in the PNG header.
- A file that is not an image, which must show a clear error.
- Running a command from the palette, then undo.
- Opening and panning a 6000x6000 image.
- Choosing a filter in the Library, the preview, Apply and undo.
- The Inspector kernel following a parameter, the Learn panel demos, a planned filter that cannot run, the export name after a filter, and the Filter menu and palette.
- Accessibility checks with axe in several states and all five themes, and on each filter panel and dialog. A serious or critical issue fails the test.
- A walk through the workspace with the Tab key, with a focus ring at every stop, and opening, filtering and undoing with the keyboard only.
- The installed web app: it goes offline, reloads and still applies a filter.

The server listens on `127.0.0.1:4173`. On your own computer, Playwright runs at most 4 tests at once. On one Windows computer with security software, many browsers at once, or browsers that used `localhost` (the IPv6 address `::1`), made page loads stall at random. The IPv4 address and the limit of 4 avoid this. CI keeps the Playwright default.

The accessibility checks use `@axe-core/playwright`. It is a test tool only and is never part of the studio. Its license is MPL 2.0.

### Viewport benchmark

Start the studio with `pnpm dev`, then run:

```bash
pnpm --filter @pixelnexus/web bench:viewport
```

The script opens a 6000x6000 image and pans it. It prints the open time and the time per frame as JSON. The docs quote only numbers from this script, with the date and the computer. See [Preview and rendering](../architecture/preview-and-rendering.md).

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
| `pnpm --filter @pixelnexus/web gen:filter-docs --check` | Kernels and worked examples in the filter pages match the filter code. |
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

## Filter figures

The figures on the filter pages come from the real filter code in two steps:

```bash
pnpm --filter @pixelnexus/web gen:filter-docs
uv run python tools/figures/make_figures.py
```

The first command runs the TypeScript filters and writes the figure data and the generated docs fragments. The second draws a light and a dark SVG for each figure into `docs/assets/figures/`. Check every changed figure in the light and the dark theme, at desktop and phone width.

## Continuous integration

GitHub Actions runs the checks on every push and pull request to `main`. The workflow is in `.github/workflows/ci.yml`. A pull request can be merged only when it passes.

To keep it fast, CI runs the end-to-end tests in Chromium only, and leaves out `tools/engine_docs.py --check`. The Full checks workflow, `.github/workflows/full-checks.yml`, runs both in full every Monday. You can also start it from the Actions tab.

A filter is marked "Implemented and tested" only after its tests have run and passed.
