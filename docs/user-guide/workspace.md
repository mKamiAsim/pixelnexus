# The workspace

This page shows you around the studio window: how to open images, move around them, compare them with the original and arrange the panels.

## Parts of the window

```text
+---------------------------------------------------------------+
| Menu bar                          Undo Redo Export | Workspace |
| Options bar: settings of the active tool                      |
+----+---------+---------------------------------+--------------+
| T  | Library | Document tabs                   | Properties   |
| o  | Images  |                                 | Inspector    |
| o  |         |            Canvas               | Learn        |
| l  |         |                                 +--------------+
| s  |         |        Compare bar              | History      |
+----+---------+---------------------------------+--------------+
| Status bar: size | zoom | pixel under the pointer | messages    |
+---------------------------------------------------------------+
```

- **Menu bar.** Every action of the studio. The same actions are in the command palette.
- **Options bar.** Settings of the active tool, and a one-line hint on how to use it.
- **Tool strip.** The tools. Hover a tool to see its name and shortcut.
- **Canvas.** The image, with one tab per open image above it and the compare bar below it.
- **Panels.** Library and Images on the left. Properties, Inspector, Learn and Developer on the right, with History, Navigator, Info and Histogram below them. Panels in one group are tabs. See [Panels](panels.md).
- **Status bar.** The image size, the zoom and the exact values of the pixel under the pointer.

Images are processed locally in your browser. Nothing is uploaded.

## Open images

- **File > Open** (Ctrl+O, or Cmd+O on a Mac) opens one or more files.
- **Drop** image files anywhere on the window.
- **Paste** an image with Ctrl+V or Cmd+V.
- **File > Open test image** opens one of nine built-in test images, such as the Siemens star or the zone plate. They are made by the studio itself, so every pixel is known.

PixelNexus opens PNG, JPEG, WebP, AVIF, GIF, BMP and TIFF. Animated files and TIFF files with several pages open their first frame or page. The Images panel lists every open image.

A file that cannot be opened gets a message with the reason, such as a damaged file or a file that is too large. The limits are in **Edit > Preferences**. The default limits are 30 MB per file, 50 million pixels and 16,384 pixels on the longest side.

When a file changes on the way in, the studio says so. For example, a 16-bit PNG is reduced to 8 bits, and a JPEG with a rotation flag is turned upright. These notes stay in the Images panel under **Details**.

## Move around the image

| To do this | Do this |
|---|---|
| Zoom in or out in steps | Ctrl and + or Ctrl and -, or the Zoom tool (Z) |
| Zoom at the pointer | Hold Ctrl, Cmd or Alt and turn the mouse wheel, or pinch on a trackpad |
| Fit the image on screen | Ctrl+0, or double-click with the Hand tool |
| Show 100% | Ctrl+1, or double-click with the Zoom tool |
| Pan | Drag with the Hand tool (H), hold Space and drag with any tool, drag with the middle button, or scroll |
| Pan with the keyboard | Click the canvas, then use the arrow keys. Add Shift for larger steps. |

The Zoom tool zooms in on a click. Alt-click zooms out. The options bar can swap the two. The options bar of the Hand and Zoom tools also has **100%**, **Fit screen** and **Fill screen** buttons.

From 800% on, a pixel grid shows the border of each pixel. Turn it off with **View > Pixel grid**. **View > Rulers** shows pixel coordinates along the edges.

## Read pixel values

Move the pointer over the image. The status bar and the Info panel show the position and the exact values of the pixel under it.

To keep one pixel, choose the Probe tool (I) and click the pixel. A white ring marks it, and the Info panel keeps showing it while you move the pointer elsewhere. Unpin it in the Info panel or the options bar.

## Compare with the original

PixelNexus keeps the original of every image. The compare bar at the bottom of the canvas switches between these views:

- **No comparison.** The current image only.
- **Split view.** The original on the left of a divider. Drag the divider.
- **Side by side.** The original and the current image next to each other. They move together.
- **Overlay.** The original on top, with a slider for its opacity.
- **Difference.** Black where nothing changed. Brighter where the images differ more.

To look at the original for a moment, hold the `\` key or press and hold the eye button.

## Arrange the panels

- **Move a panel.** Drag its tab to another group, to an edge of a group, or out of the window area to float it.
- **Stack panels.** Drop a tab onto another group's tabs.
- **Close a panel.** Use the x on the group header. Reopen it from the **Window** menu. Choosing a panel that is open but hidden behind another tab brings it to the front.
- **Collapse a side.** The double arrow on a group header folds that side of the workspace into a narrow strip of icons. Click an icon, or the expand arrow, to open the side again.
- **Choose a workspace.** The Workspace menu in the top right, or **Window > Workspace**, sets a ready-made layout:
    - **Essentials:** Library and Images on the left. Properties, Inspector, Learn and Developer on the right, with History, Navigator, Info and Histogram below.
    - **Study:** a wide Learn panel with the Inspector and Properties, and Info, Histogram, Navigator and History below, for teaching and learning.
    - **Developer:** a wide Developer panel with the Inspector and Properties, and History, Info, Histogram and Navigator below.
    - **Compact:** all panels in one narrow group, for small screens and tablets.
    - **Phone:** the canvas on top at full width, and all panels in one tab group below it.
- **Reset.** **Window > Reset workspace** restores the current workspace.

The studio remembers your layout in this browser.

## Phones and tablets

The studio picks a layout for the size of the screen:

- Under 768 pixels wide, such as a phone, it uses **Phone**. The name of the studio hides, so the menus fit, and the menu bar scrolls sideways.
- From 768 to 1179 pixels, such as a tablet, it uses **Compact**.
- From 1180 pixels, it uses the workspace you chose last.

It changes the layout only when the screen moves into another of these sizes, for example when you turn a tablet or make a window narrow. Your own arrangement stays until then. The sizes are our choice.

## Themes

**View > Theme** offers Light, Dim, Dark, Midnight and High contrast. Light is the default. The canvas around the image stays the same neutral gray in every theme.

## Find any command

Press Ctrl+K (Cmd+K on a Mac) and type part of a name, such as "rotate", "export" or "dark". Use the arrow keys and Enter to run it. See [Keyboard shortcuts](keyboard-shortcuts.md) for the full list.
