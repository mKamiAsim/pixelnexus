# Frontend integration

Browser filters run in the studio, in Web Workers. This page explains the contract a filter meets. The wider picture is in [Frontend architecture](../architecture/frontend-architecture.md).

## The filter kinds

Every browser filter is an object in `web/src/core/filters`, with the catalog `id`, a `radius` and a `representation`. Its `kind` says how it runs:

| Kind | Works on | Example |
|---|---|---|
| `smooth` | one plane, keeps the meaning of values, results clipped | box, Gaussian, median |
| `derived` | one plane, makes a new signed quantity, results use the output mapping | Sobel, Laplacian |
| `color` | the three color planes together | bilateral in color mode, vector median |
| `point` | one value at a time, as a transfer curve | gamma, levels |
| `pixel` | the three values of one pixel | grayscale, color balance |

`web/src/core` is pure TypeScript. It never imports React, so filters run the same in workers, in tests and in Node for the docs.

## Tiles and workers

The studio splits the image into tiles, each with a halo of `radius` pixels, and runs them in a pool of workers. A region therefore gives the same result as the whole image, which `run.test.ts` checks. Alpha is handled once for all filters: colors are weighted by alpha where the catalog says so.

## Parameters

Parameters arrive validated against the catalog. The Properties panel builds its controls from the catalog, so a new parameter needs no UI code.

## Preview

Filters with `preview: live` get a preview while you change values. Expensive ones may preview at a lower resolution, and the studio labels that preview as approximate.

## Commands

A few entries, such as Resize and Rotate, run through a studio command instead of the filter engine. Their catalog entry names it with `command`, and the catalog check makes sure it exists in `web/src/app/commands.ts`.
