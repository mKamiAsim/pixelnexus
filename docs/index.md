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

!!! note "Version 1.0.0"
    PixelNexus 1.0.0 is released. 277 filters and 20 tools run, each with passing tests. See the [release notes](release-notes.md).

**Open the studio:** <https://mkamiasim.github.io/pixelnexus/studio/>. To learn how to use it, and how to study with it, start with [The studio](user-guide/studio.md).

Every filter and tool has an entry in the catalog. Each entry has an honest status. The table below is generated from the catalog.

--8<-- "catalog-status.md"

The catalog groups the entries into families:

--8<-- "catalog-families.md"

## How these docs are organized

- **Getting started** explains how to install, run and test PixelNexus.
- **User guide** shows you how to use the studio, and how to study with it.
- **Architecture** explains how the studio is built.
- **Mathematics** explains the ideas that many filters share.
- **Filters** has one page for each filter: its formula, kernel or operator, a worked example, its limits and its tests.
- **Reference** lists every filter, parameter and dependency, with the limitations and release notes.
