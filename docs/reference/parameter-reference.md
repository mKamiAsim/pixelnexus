# Parameter reference

Every parameter of every filter is described in the catalog, with its type, default, range, description and effect. The Properties panel builds its controls from these, and each filter page shows its own table. This page explains the types and lists the shared parameters.

## Types

| Type | Control | Value |
|---|---|---|
| `number` | slider with an exact field | a decimal number inside `min` and `max`, on the `step` |
| `integer` | slider with an exact field | a whole number, odd only where `oddOnly` is set, as for window sizes |
| `angle` | dial and field | degrees |
| `boolean` | switch | on or off |
| `select` | menu | one of the listed options |
| `color` | color field | a hex color such as `#ff8800` |
| `kernel` | text grid | rows of numbers, for a custom kernel |
| `structuring-element` | text grid | rows of 0 and 1, for morphology |
| `points` | text field, or clicks in the Spectrum panel | pairs of numbers, such as notch positions |
| `image` | menu of open images | another open image of the same size, used as a guide |

## How values are checked

A value from a slider, a preset, a pipeline file or a project file goes through the same check:

- Numbers outside the range are moved to the nearest end.
- Integers are rounded, and an even size becomes the next odd one where only odd sizes are allowed.
- A choice that is not an option falls back to the default.

Each change is reported as a plain warning, such as "Sigma was lowered to 50, its largest value."

## Shared parameters

Many filters share these parameters. Their entries reuse them with `ref`.

--8<-- "common-params.md"

## The fields of a filter entry

See [Filter definition schema](../implementation/filter-definition-schema.md).
