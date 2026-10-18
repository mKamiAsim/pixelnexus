# Compare grid

The compare grid shows several filters or settings side by side on the same part of the image. Open it with **Filter > Compare grid**.

## The crop

Every cell runs on the same 256 x 256 pixels of the active image, at full resolution. What you see is the exact result, not a scaled preview. The crop sits around the pixel pinned with the Probe tool (I), or at the center of the image when no pixel is pinned. Pin the pixel first to compare the part you care about. A smaller image is used whole.

The first cell is the original crop, with its place in the image.

## Add cells

- **Add the current settings** adds the filter selected in the Library with its values from Properties.
- **Add sweep** varies one value of the selected filter and keeps the others. Choose the value, then the first and last value and the number of cells. For example, sigma from 1 to 5 in 5 cells gives 1, 2, 3, 4 and 5. A choice tries each of its options, and a switch tries off and on.

Every value keeps the rules of its parameter, such as its range and odd sizes. The grid holds at most 12 cells. You can mix filters, for example a median filter next to a Gaussian filter.

## Run and use

- **Run** runs every cell, one after another, and shows each result with its time. A cell that fails shows the reason.
- **Use** copies a cell's filter and values into Properties, so you can apply them to the whole image.
- **Remove** takes a cell out, and **Clear** empties the grid.

Filters that make a table or features, and filters that run from their own dialog, cannot be compared here.
