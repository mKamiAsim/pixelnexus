# Filter catalog

Every filter and tool PixelNexus knows is an entry in `catalog/`, the single source of truth. The studio, the engine and these docs all read it. This page lists every entry with its status. It is generated from the catalog, so it is always current.

## Status counts

--8<-- "catalog-status.md"

## Families

--8<-- "catalog-families.md"

## Every filter and tool

- [Filters](../filters/index.md) lists every filter by family, with its status and a link to its page.
- [Selections](../selection/index.md) lists every selection tool.

## What the statuses mean

| Status | Meaning |
|---|---|
| Implemented and tested | The entry runs, and its tests have run and passed. |
| Implemented, testing incomplete | The entry runs, but not all of its tests exist yet. |
| Partially implemented | Some modes or parameters are missing. |
| Available through an optional dependency | The entry needs a package that is not installed by default. |
| Available through an optional pretrained model | The entry needs a model you download first. |
| Planned but not implemented | The entry is listed, but it cannot run yet. |
| Unsupported or deprecated | The entry will not be built, with the reason on its page. |
