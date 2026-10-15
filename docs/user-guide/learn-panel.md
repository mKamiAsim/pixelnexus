# The Learn panel

The Learn panel teaches the selected filter. It explains the idea in plain words, then runs small demos on your own image. Every demo uses the real filter code, so what you see matches the result of **Apply**.

Open it from **Window > Learn**, or choose the **Study** workspace. Choose a filter in the Library first.

While a selection tool is active, such as the Magic Wand, the panel first shows a short lesson about that tool. It says what the tool does, how it works, what its settings do and which mistakes are common.

## Basic and Academic

The switch at the top sets the level of detail.

- **Basic** explains the filter without formulas.
- **Academic** adds a precise description and the formula with your current values. A button opens the Inspector, which lists every symbol and shows the operator.

## Sections

| Section | What it holds |
|---|---|
| In one sentence | What the filter does. |
| How it works | The idea in a few short steps. |
| See it on your image | The demos. They run on the active image. |
| What the parameters do | Each parameter with its current value and its effect. |
| Try this | Small experiments that show the filter's behavior. |
| Common mistakes | Settings and situations that give poor results. |
| Where to go next | Related filters and the docs page of this filter. |

Planned filters show a note instead. Their lesson arrives with their code.

## Choose the pixel

Most demos look at one pixel. At first it is the center of the image. To use another pixel, choose the Probe tool (I) and click the image. The demos follow the pinned pixel. Some demos also have buttons that move the pixel one step at a time.

## Demos

| Demo | What it shows | Filters |
|---|---|---|
| Neighborhood stepper | The window of pixel values around the pixel, the kernel, each value times its weight, and the sum. The sum is the output of the real filter at that pixel. | Box, Gaussian, motion blur, Laplacian, unsharp mask, Sobel |
| Impulse response | One white pixel on black, after the filter. For a linear filter, this picture is the kernel itself. A switch stretches the brightness, so faint weights show. | Box, Gaussian, motion blur, Laplacian, unsharp mask |
| Rank stepper | The window values, sorted, with the middle one marked. That value becomes the output. | Median |
| Gradient explorer | The horizontal and vertical change at the pixel, the strength and the direction as an arrow. A small map shows the direction at every pixel as color and the strength as brightness. | Sobel |
| Line profile | The brightness along the row or column through the pixel, before and after the filter. You see how the filter changes edges and noise. | Every Phase 3 filter except Sobel |
| Feature viewer | The 128 x 128 patch around the pixel, with the features a detector finds there drawn on it, and the strongest in a small table. The detector runs in the PixelNexus engine. | Blob detectors |

The catalog sets which demos each filter shows. Demos for later filter families, such as a frequency explorer or a morphology stepper, arrive with those families. The panel names the phase that brings them.

## Words with a dotted underline

Words with a dotted underline are in the glossary. Point at one, or focus it with the keyboard, to read a short definition.
