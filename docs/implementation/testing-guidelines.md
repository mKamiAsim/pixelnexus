# Testing guidelines

A filter is `implemented-tested` only when its tests have run and passed. This page explains what a good test is here. The commands are in [Running tests](../getting-started/running-tests.md).

## Compare with an independent reference

The main test of a filter compares its result with a library that implements the same method, such as SciPy, scikit-image or OpenCV:

- `tools/fixtures_*.py` compute the reference results and `tools/make_fixtures.py` writes them to `web/tests/fixtures/filters.json`.
- Where two libraries offer the same operation, the script first checks that they agree, and stops if they do not.
- The TypeScript tests compare within a stated tolerance, and the tolerance has a reason, such as float32 against float64.

When no library exists, test the defining properties instead, with a reason written next to the test. Examples: a blur keeps a flat image flat, a filter with a symmetric kernel commutes with a mirror, two halves weighted by their pixels give the whole.

## Kinds of tests

| Kind | Where | Runs |
|---|---|---|
| Unit tests | `web/src/**/*.test.ts`, in Node | `pnpm test` |
| Browser tests | `web/src/**/*.browser.test.ts`, in Chromium | `pnpm test` |
| E2E tests | `web/tests/e2e/*.spec.ts`, Playwright on the built studio | `pnpm e2e` |
| Engine tests | `engine/tests/`, pytest | `uv run pytest` |
| Catalog check | every entry, its files and registrations | `tools/check_catalog.py` |

## Rules

- Test tiling for browser filters: a region must equal the same part of the whole result.
- Test every border mode the filter offers.
- Fast paths need parity tests against the plain code, as the bilateral filter has.
- Tests with real AI models run only where the model is downloaded, and are skipped elsewhere. CI uses tiny dummy ONNX models.
- No test calls an external service. Mock servers run on this computer.
- E2E tests check accessibility with axe on the panels they touch.
