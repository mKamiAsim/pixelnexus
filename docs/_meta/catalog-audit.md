# Catalog audit

Written by `tools/audit_catalog.py` on 2026-10-17, from the results of a full test run. This file is not part of the published site.

- Test files with results: 155, of which 155 passed.
- Entries marked implemented-tested: 297.
- Entries tested through their functions, checked by hand: 15.
- Problems: 0.

## Tested through their functions

| Entry | Test |
|---|---|
| `ai-click-select` | seedActions.test.ts tests the clicks sent to the provider. |
| `ai-matting` | aiSelectActions.test.ts and test_ai.py test soft mattes and MODNet sizes. |
| `ai-subject` | aiSelectActions.test.ts tests the answer becoming the selection. |
| `background-heuristic` | subject.test.ts tests the background as the rest of the subject. |
| `click-select-classical` | seeds.test.ts tests the seed map sent to the engine. |
| `color-range` | selection.test.ts tests colorRange. |
| `edge-assisted` | snap.test.ts tests snapping a selection to edges. |
| `metrics` | quality.test.ts tests MSE, MAE, PSNR and SSIM against skimage.metrics. |
| `object-select-classical` | test_interactive.py tests the graph cut from seeds. |
| `quick-selection` | quick.test.ts tests the SLIC superpixels and the growing. |
| `resize` | resample.test.ts tests resizeImageTo against the NumPy reference. |
| `rotate-free` | resample.test.ts tests rotateImage against the NumPy reference. |
| `select-brightness` | selection.test.ts tests selectBrightness. |
| `select-hsv` | selection.test.ts tests selectHsv. |
| `subject-heuristic` | subject.test.ts tests the saliency maps and the subject. |
