# Projects

A project file keeps your work so you can continue later or on another computer. It has the extension `.pnx`.

## What a project holds

- Every open image, with its whole history: each step's image, selection, filter and values, and the AI result mark.
- The current step of each image, and how many old steps were dropped.
- The saved selections of each image (the Masks panel).
- The pipeline from the Pipeline panel.

A project never holds API keys, AI provider settings or other private data. Layouts, favorites and presets stay in the browser. Presets have their own export.

## Save and open

- **File > Save project** (Ctrl+Shift+S) downloads the project, named after the active image.
- **File > Open project** reads one. **File > Open** and dropping a `.pnx` file on the studio work too.

The images of a project open as new tabs, next to the images that are already open. The project's pipeline replaces the current one, and its steps are checked against the catalog as on load.

## Exact images

Every image is stored as an 8-bit RGBA PNG and read back by PixelNexus's own PNG reader, so it opens byte for byte as it was saved. An image used by several steps is stored once.

## Inside the file

A `.pnx` file is a ZIP archive, so any unzip tool can open it:

- `project.json` describes the images, steps, saved selections and pipeline (format `pixelnexus-project`, version 1).
- `images/` holds the images and `masks/` the selections, as PNG files. A selection is a gray image, 255 inside.

The archive stores its files without compression, since PNG files are already compressed. A project with long histories of large images can be large: a 6000 x 6000 image takes up to about 144 MB per distinct step.
