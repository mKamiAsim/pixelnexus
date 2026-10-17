# Adding a filter

This walk-through follows a real filter, the [box filter](../filters/linear/box.md), from its catalog entry to its docs page. Every file named here exists in the repository, so you can open it next to this page.

## 1. Decide the engine

Each filter has exactly one engine:

- **browser**: TypeScript in `web/src/core/filters`, run in Web Workers. Use it when the filter is a neighborhood or point operation that runs fast enough on the CPU.
- **science**: Python in `engine/src/pixelnexus_engine/filters`, run by the local engine. Use it when a mature library does the work, such as scikit-image or OpenCV, or when the filter is too slow for a browser.

The box filter is a browser filter: running sums make it fast at any window size.

## 2. Write the catalog entry

Create `catalog/filters/<family>/<id>.yaml`. The box filter's file is `catalog/filters/linear/box.yaml`. It holds:

- Identity: `id`, `name`, `aliases`, `family`, `tier`, `engine`, `phase`, `status`.
- What it does: `summary`, `purpose`, `classification`, `output`.
- The parameters, with type, default, range, description and effect. The box filter has `size`, an odd integer from 3 to 51, and refs to the shared `border` and `channelScope`.
- The mathematics: `formula`, `formulaExplanation`, `symbols`, `steps`, `complexity`.
- Judgment: `useCases`, `advantages`, `limitations`, `artifacts`.
- `references` with DOI or URL. Never invent a citation.
- `implementation` and `tests`, which must name files that exist.
- `learn`: the Learn panel text and demos.
- `docsPage`.

Start with `status: planned` until the code and tests exist. Every field is described in [Filter definition schema](filter-definition-schema.md). Check the entry with:

```bash
uv run python tools/check_catalog.py --summary
```

## 3. Write the code

The box filter is `boxFilter` in `web/src/core/filters/linear/box.ts`. It is a `PlaneFilter` of kind `smooth`:

- `id: "box"` must equal the catalog id.
- `radius(params)` says how many pixels of halo a tile needs: `(size - 1) / 2`.
- `plane(input, params, context)` computes the result for one plane, here with running sums from `convolve.ts`.
- `representation(params)` builds the kernel the Inspector shows, from the same code.

Then add `boxFilter` to the list in `web/src/core/filters/registry.ts`. The catalog check fails if the id or the registration is missing.

For a science filter, write a function in a module of the engine's `filters` package, decorate it with `@register("<id>", representation=...)`, and import the module in `filters/__init__.py`. See [Science engine integration](science-engine-integration.md).

## 4. Test it against a reference

Correctness is checked against an independent library, not against the code itself:

- `tools/fixtures_filters.py` runs `scipy.ndimage.uniform_filter` for every border mode and two sizes, and writes the results to `web/tests/fixtures/filters.json` through `tools/make_fixtures.py`.
- `web/src/core/filters/filters.test.ts` runs the box filter on the same input and compares.
- `web/src/core/filters/run.test.ts` checks tiling: a region gives the same result as the whole image.

Only when the tests pass may the status become `implemented-tested`. See [Testing guidelines](testing-guidelines.md).

## 5. Write the docs page

Create `docs/filters/<family>/<id>.md` with the 12 headings of the filter page template. Facts come from the catalog through snippets, such as `--8<-- "filters/box-facts.md"`, written by:

```bash
uv run python tools/gen_docs.py
```

Kernels, worked examples and figures come from the real code: `web/scripts/gen-filter-docs.mjs` runs browser filters in Node, and `tools/figures/make_figures.py` draws light and dark figures. Explanations and limitations are written by hand, in the style of `planning/WRITING_STYLE.md`. Add the page to `mkdocs.yml`, then check:

```bash
uv run mkdocs build --strict
uv run python tools/lint_prose.py
```

## 6. Check everything

Run the full list in `.github/workflows/ci.yml`. The Library, Properties, Inspector and Learn panels now show the filter, all built from its catalog entry.
