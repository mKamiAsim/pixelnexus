# Formula rendering

This page explains how the Inspector and the Learn panel show formulas, and how a formula gets the current parameter values.

## Formulas live in the catalog

Each catalog entry has a `formula` field in LaTeX. It has placeholders for parameters, written as two braces around the parameter key. For example, the Gaussian formula ends with `\sigma = {{sigma}}`.

At display time, `fillFormula` in `web/src/catalog/formula.ts` replaces each placeholder with the current value:

| Value type | Shown as |
|---|---|
| Whole number | The number, for example `5` |
| Decimal number | Up to 4 decimals, for example `2.5` |
| On or off | `\text{on}` or `\text{off}` |
| Choice | The option key as text |

A placeholder that names no parameter shows as a question mark. `tools/check_catalog.py` fails when a placeholder names a key that the filter does not have, so this does not reach users.

## Rendering

The studio renders LaTeX with [KaTeX](https://katex.org/). KaTeX writes both HTML for the eyes and MathML for screen readers. A formula that KaTeX cannot read shows the error in place, and the rest of the panel keeps working. Wide formulas scroll sideways instead of overflowing the panel.

The docs site renders the same LaTeX with MathJax. The project writing rules allow only LaTeX that both KaTeX and MathJax support.

## Symbols and explanations

Next to the formula, the Inspector shows:

- **Symbols.** A table with the meaning of every symbol, from the catalog field `symbols`.
- **Explanation.** One or two plain sentences on what the formula does to the pixels, from `formulaExplanation`.
- **Label.** Exact computation, mathematical definition, approximation or simplified explanation. See [The Inspector](overview.md).

Glossary terms in these texts get a dotted underline. Point at one to read its definition. The terms come from `catalog/glossary.yaml`. Only the first use of a term in each text is marked, so the text stays readable.

## Copy as LaTeX

The **LaTeX** button copies the formula with the current values filled in. You can paste it into a paper or a notebook, and it shows the settings you used.
