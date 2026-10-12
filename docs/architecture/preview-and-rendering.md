# Preview and rendering

This page explains how the studio draws an image on screen: the coordinate system, the WebGL2 renderer, the compare modes, and what was measured on large images.

## Screen and image coordinates

The viewport maps an image point to a screen point with one zoom factor and one pan offset. This is an exact computation.

\[
s_x = x \cdot z + p_x, \qquad s_y = y \cdot z + p_y
\]

where

- \(x, y\) is a point in the image, in pixels. \(x\) grows to the right and \(y\) grows downward.
- \(s_x, s_y\) is the same point on screen, in CSS pixels from the top left of the viewport.
- \(z\) is the zoom. 1 means 100%, so one image pixel covers one CSS pixel.
- \(p_x, p_y\) is the pan offset, the screen position of the image's top left corner.

Pixel \((i, j)\) covers the square from \((i, j)\) to \((i + 1, j + 1)\). The pixel under the pointer is \(\lfloor (s_x - p_x) / z \rfloor\) and \(\lfloor (s_y - p_y) / z \rfloor\). The code is in `web/src/canvas/viewport.ts` and its tests in `viewport.test.ts`.

To zoom at the pointer, the studio keeps the image point under the pointer fixed. It solves the formula above for the new pan offset:

\[
p'_x = s_x - x \cdot z', \qquad p'_y = s_y - y \cdot z'
\]

where \(z'\) is the new zoom and \(p'_x, p'_y\) is the new pan offset.

## Zoom levels

- **Steps.** Zoom in and zoom out move through fixed steps from 1% to 6400%, as in Photoshop. A zoom between two steps moves to the next step in that direction.
- **Wheel and pinch.** Ctrl, Cmd or Alt with the mouse wheel, or a trackpad pinch, zoom smoothly at the pointer.
- **Fit.** The largest zoom that shows the whole image with a 24 pixel margin. Small images are not enlarged, so they open at 100%.
- **Fill.** The smallest zoom at which the image covers the whole viewport.
- **100%.** One image pixel per CSS pixel, centered.
- **Pan limits.** At least 48 screen pixels of the image always stay in view, so the image cannot get lost.

## The renderer

The renderer is in `web/src/canvas/renderer.ts`. It draws one triangle that covers the viewport. A fragment shader then decides the color of each screen pixel. It draws on demand, when something visible changes, not in a loop.

For each screen pixel the shader:

1. Converts the screen position to an image position with the formula above.
2. Paints the pasteboard color if the position is outside the image.
3. Reads the image color. At 100% and above it reads the exact pixel, so pixels show as sharp squares. Below 100% it reads from mipmaps, smaller copies of the image made by the graphics card, so a large image shrinks smoothly.
4. Blends the color over a checkerboard of 8 pixel squares, so transparent areas are visible.
5. Draws the pixel grid from 800% on, when the grid is turned on.

Colors are never changed for display. The pasteboard around the image stays a neutral gray in every theme, so the theme does not change how you judge the image.

If the browser drops the graphics context, for example after a driver update, the viewport creates a new renderer and draws again.

## Compare modes

Every document keeps its original pixels. The compare modes put the original next to the current image.

| Mode | What you see |
|---|---|
| Split | The original on the left of a divider and the current image on the right. Drag the divider, or focus it and use the arrow keys. |
| Side by side | The original in the left half and the current image in the right half. Both halves pan and zoom together. |
| Overlay | The original on top of the current image, with an opacity slider. |
| Difference | The absolute difference per channel. Black means no change. |
| Hold to see the original | Hold the `\` key, or press and hold the eye button. Release to see the current image again. |

The difference mode computes, for each color channel \(c\),

\[
D_c = \lvert C_c - O_c \rvert
\]

where \(C_c\) is the current value and \(O_c\) is the original value of the same pixel. The alpha of the result is the larger of the two alphas. This is an exact computation on the values sent to the screen. After a rotation the two images have different shapes, so the difference compares pixels at the same coordinates, not the same scene content.

## Rulers and Navigator

- **Rulers.** View > Rulers shows image pixel coordinates along the top and left edges. Labels stay at least 56 screen pixels apart. A blue mark follows the pixel under the pointer.
- **Navigator.** A small copy of the whole image with a red frame around the visible part. Click or drag in it to move the view. The slider sets the zoom.

## Large images

The working image uses 4 bytes per pixel. A 6000x6000 image takes 144 MB in memory, and the same again on the graphics card, plus a third more for the mipmaps. The default limits (Edit > Preferences) allow up to 50 million pixels and 16,384 pixels on the longest side. The renderer also refuses an image that is larger than the graphics card's texture limit, with a message that names the limit.

These numbers were measured with `pnpm --filter @pixelnexus/web bench:viewport`. The script opens a 6000x6000 PNG file of 28.1 MB in the running studio. Then it pans the image for 120 frames, with one wheel event per frame. It does this at the fitted zoom and at 100%.

| Measure | Result |
|---|---|
| Date | 2026-10-12 |
| Computer | Office PC, NVIDIA GeForce RTX 3060 Laptop GPU, Direct3D 11 through ANGLE |
| Browser | Chromium 153 (headless, from Playwright) |
| Open the file, from the file input to the first frame | 1091 to 1196 ms in 3 runs |
| Time per frame while panning, median | 16.6 to 16.7 ms in 3 runs |
| Time per frame while panning, 95th percentile | 24.5 to 32.1 ms in 3 runs |
| Console errors | None |

A display that refreshes 60 times per second shows a new frame every 16.7 ms, so the median frame keeps up with the screen. These numbers come from one computer. Other hardware gives other numbers. A full performance pass with profiling is planned for Phase 8.

## Filter previews

Filters arrive in Phase 3. The preview policy is set in the project plan. At 50% zoom or more, a preview covers the visible part at full resolution. Below 50%, a smaller copy is used and the studio shows an "Approximate preview" badge. Apply always runs at full resolution.
