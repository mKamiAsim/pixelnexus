# Release notes

## 1.0.0 (2026-10-17)

The first release of PixelNexus.

### The studio

- A web studio with dockable panels, five color themes and layouts for desktop, tablet and phone. It can be installed as an app and opens offline after the first visit.
- Opens PNG, JPEG, WebP, AVIF, GIF, BMP and TIFF. Exports PNG, JPEG, WebP and TIFF.
- Zoom, pan, compare modes, a pixel probe, rulers and a full history with thumbnails. A step in the history can be deleted, and the later steps are computed again.
- Photoshop-style selections: marquee, lasso, magnetic lasso, brush, Magic Wand, Quick Selection, Color Range, subject and object selection, refine and saved masks.
- Pipelines, presets, a compare grid that sweeps one value, quality metrics and project files that keep the open images with their history, saved selections and the pipeline.

### Filters

- 277 filters run: 201 in the browser and 76 in the PixelNexus engine, a local Python server. 20 more tools, such as selections and metrics, run too. Every one of them has passing tests.
- 9 more engine filters need a model or a package that you add. 24 filters are planned, and 7 are listed as unsupported with the reason.
- Every filter has a docs page with its formula, its kernel or operator, a worked example, its complexity, its limits and its tests.

### Learning

- The Inspector shows the formula and the kernel or operator of the selected filter, with your values. A test checks that every kernel it shows is the kernel that runs.
- The Learn panel has live demos on your own image.

### AI, all optional

- 20 models are listed, each with its size and license. Nothing downloads until you choose it.
- Small models run on your device in the browser. Larger ones run in the engine. External AI services are used only after you allow them, each time.
- AI results carry a label that says they may show detail that is not in the scene.

### Quality checks before the release

- 3710 studio tests, 895 Python tests, and 71 end-to-end tests in Chromium and in Firefox pass.
- An audit of the catalog found no filter shown as working without a passing test.
- 20 random filter pages were checked by hand against the code. One formula was fixed.
- An accessibility audit fixed six problems with focus and keyboard use.
- A clean install with Docker and with the README steps was checked, and two install problems were fixed.

See [Limitations](reference/limitations.md) for what this release does not do.
