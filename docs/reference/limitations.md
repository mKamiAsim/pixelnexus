# Limitations

What PixelNexus does not do, or does with limits. Each filter page also lists its own limitations and artifacts.

## Images

- **8 bits per channel.** Files with 16 bits are reduced when they open, with a warning. Filters compute in 32-bit floats inside, but every result is stored as 8 bits.
- **sRGB only.** Embedded color profiles are converted to sRGB on open. Exported files have no profile.
- **One frame.** Only the first frame of an animated GIF or a multi-page TIFF opens.
- **Size.** The default limits are 30 MB per file, 50 million pixels and 16,384 pixels on the longest side. Change them in **Edit > Preferences**. Very large images can still run out of browser memory, since the history keeps every step's image.
- **No layers.** An image is one picture with a selection, not a stack of layers.

## Filters

- Each filter has exactly one engine. Science filters need the local PixelNexus engine running.
- Planned filters are listed in the Library but cannot run.
- Canny runs as one piece, since its hysteresis follows edges across the whole image. It is the slowest of the common filters on large images. See [Performance](../architecture/performance.md).
- A pipeline cannot hold filters that make tables or features, filters that run from their own dialog, or filters that need a selection as their input.
- Deleting a history step recomputes the later steps, but not a rotation, an AI result or a pipeline run.

## AI

- AI results can show detail that is not in the scene. They carry a label that says so.
- EfficientSAM, the on-device click model, takes no negative clicks.
- MODNet is trained on portraits. Other subjects can get a poor soft edge.
- Some external services refuse requests from a web page (CORS).
- Two models allow non-commercial use only.

## Browsers and devices

- The studio needs a current browser with WebAssembly, Web Workers and WebGL2. On-device models use WebGPU where it exists, and are slower without it.
- The phone layout is a first step. There is no native phone app.
