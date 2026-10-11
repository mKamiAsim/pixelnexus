# PixelNexus

PixelNexus is an image processing studio that runs in your web browser. It is made for teaching and learning image processing. It also works for everyday photo edits.

These pages are the technical reference. They explain how each filter works, the mathematics behind it, how it is built and how it is tested.

## What PixelNexus does

- Opens images and applies filters to the whole image or to a selected area.
- Offers selection tools like those in Photoshop, from a simple rectangle to subject selection.
- Shows the formula, the kernel and the limits of every filter in the **Inspector** panel.
- Explains every filter in plain words in the **Learn** panel, with live demos on your own image.
- Runs classical filters in the browser. Advanced methods run in an optional Python engine on your computer.
- Keeps your images on your device. AI tools are optional. An external AI service is used only after you allow it, every time.

## Who it is for

- **Students** who want to see what a filter does to real pixels.
- **Teachers** who need live examples for a lecture or a lab.
- **Developers** who want a clear reference for an algorithm and its code.
- **Everyday users** who need to blur, sharpen, clean up or fix the color of a photo.

## Project status

!!! note "Early development"
    PixelNexus is in Phase 1 of 11. The filter catalog, the build tools, the tests and these docs are in place. The studio workspace arrives in Phase 2. No filter runs yet.

Every filter and tool has an entry in the catalog. Each entry has an honest status. The table below is generated from the catalog.

--8<-- "catalog-status.md"

The catalog groups the entries into families:

--8<-- "catalog-families.md"

## How these docs are organized

- **Getting started** explains how to install, run and test PixelNexus.
- Pages about the architecture, the mathematics and each filter are added as each phase is built. A page appears only when its content is real.
