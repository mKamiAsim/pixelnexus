# Filter definition schema

A filter entry is a YAML file in `catalog/filters/<family>/`. Its fields are defined by the JSON schema `catalog/schema/catalog.schema.json`, and `tools/check_catalog.py` checks every entry against it. The studio's TypeScript types are generated from the same schema with `pnpm gen`. This table is generated from the schema too.

--8<-- "filter-schema.md"

## Rules beyond the schema

`tools/check_catalog.py` also checks:

- Implemented entries name an implementation file and symbol that exist, and test files that exist.
- A browser filter declares its id in code and is registered in `web/src/core/filters/registry.ts`.
- A science filter registers its id with `@register`, in a module the `filters` package imports.
- Formulas only use placeholders of real parameters.
- `related` ids, families, models and docs pages exist.
- An entry lives in the folder of its family.

## Tools

Tools, such as the selection tools, use a smaller set of the same fields, in `catalog/tools/`. Models are in `catalog/models.yaml`, AI tasks in `catalog/ai-tasks.yaml`, and AI providers and their presets in `catalog/providers.yaml`.
