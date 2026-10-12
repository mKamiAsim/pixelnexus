# The Inspector

The Inspector panel shows the mathematics of the selected filter: the formula, the operator, the parameters, the algorithm and the limits. Every number in it comes from the code that runs the filter, with the values you set now.

Open it from **Window > Inspector**, or choose the **Study** or **Developer** workspace. Choose a filter in the Library first.

## Tabs

| Tab | What it shows |
|---|---|
| Overview | The purpose, a test image before and after the filter, and the facts: linearity, operation, image types, channels, boundary, support radius, engine and source file. |
| Formula | The formula with the current values filled in, a table of symbols and a plain explanation. |
| Operator | The kernel, rank window, curve, weights or random process that the filter uses. |
| Parameters | Every parameter with its control, its meaning, its effect, its key, its default and its range. |
| Algorithm | The steps of the computation and, for some filters, pseudocode. |
| Limits | Time and memory complexity, limitations, artifacts, advantages and use cases. |
| References | The sources the filter follows. |

A planned filter shows its description, but the parts that need code stay empty until the filter is built.

## Labels on the maths

Each formula and operator carries one of four labels. The catalog sets the label, and the docs use the same words.

| Label | Meaning |
|---|---|
| Exact computation | The studio computes this, value for value. |
| Mathematical definition | The textbook definition. The code computes a discrete version of it. |
| Approximation | The code approximates this, for example with a truncated kernel. |
| Simplified explanation | A simpler picture that helps understanding. It is not what the code computes. |

## Copy buttons

- **LaTeX** on the Formula tab copies the formula with the current values.
- **NumPy** on the Operator tab copies each kernel as a NumPy array, ready for Python.
- **JSON** copies the filter id and the current values. The Properties panel has the same button, and the Developer panel shows the same JSON.

## Live example

The Overview tab runs the filter on a small built-in test image and shows the result next to the input. It uses the current values, so you see the effect of each change at once. The test image fits the filter: a Siemens star or disks for edge filters, a color sweep for color filters, and a noisy pattern for the median filter.

## More pages

- [Kernel generation](kernel-generation.md): where the shown kernels come from.
- [Formula rendering](formula-rendering.md): how formulas get their current values.
- [Parameter synchronization](parameter-synchronization.md): how all panels show the same values.
- [Developer mode](developer-mode.md): the Developer panel.
