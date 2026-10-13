// Figures and worked examples for the ideal, Butterworth and Gaussian pass and reject filters.
// gen-filter-docs.mjs calls freqDocs with its helpers. Every number comes from the filter code.

const SHAPES = { ideal: "Ideal", butterworth: "Butterworth", gaussian: "Gaussian" };

const BANDS = {
  lowpass: {
    params: { cutoff: 0.1 },
    title: "Low-pass, D0 = 0.1",
    message: "keeps the rings near the center of the zone plate, where the frequency is low",
    setting: "D_0 = 0.1",
  },
  highpass: {
    params: { cutoff: 0.1, outputMapping: "offset" },
    title: "High-pass, D0 = 0.1",
    message: "removes the rings near the center of the zone plate and keeps the outer ones",
    setting: "D_0 = 0.1",
  },
  bandpass: {
    params: { center: 0.2, width: 0.1, outputMapping: "offset" },
    title: "Band-pass, D0 = 0.2",
    message: "keeps only the rings whose frequency lies in the band",
    setting: "D_0 = 0.2 and W = 0.1",
  },
  bandreject: {
    params: { center: 0.2, width: 0.1 },
    title: "Band-reject, D0 = 0.2",
    message: "removes the rings whose frequency lies in the band",
    setting: "D_0 = 0.2 and W = 0.1",
  },
};

const NOTES = {
  ideal: "The ideal filter switches between 1 and 0 at once.",
  butterworth:
    "With order 2 the Butterworth filter changes smoothly and is exactly one half at the cutoff.",
  gaussian: "The Gaussian filter changes smoothly and never jumps.",
};

const BAND_SHAPE_NOTES = {
  ideal: "The ideal filter switches between 1 and 0 at once, at the band edges 0.15 and 0.25.",
  butterworth:
    "With order 2 the Butterworth filter changes smoothly, and the band-reject response is 0 at D_0.",
  gaussian: "The Gaussian filter changes smoothly, and the band-reject response is 0 at D_0.",
};

const BAND_NOTES = {
  lowpass: "",
  highpass: " The high-pass response is 1 minus the low-pass response.",
  bandpass: " The band-pass response is 1 minus the band-reject response.",
  bandreject: "",
};

export function freqDocs(h) {
  const { run, pic, figure, example, mdTable, fix, synthetic, createImage, browserFilter } = h;
  const { frequencyResponse } = h;
  // The local frequency of the zone plate is r / 160 cycles per pixel at a distance r.
  const zone = synthetic.zonePlate(160, 160);
  for (const [shape, name] of Object.entries(SHAPES)) {
    for (const [band, spec] of Object.entries(BANDS)) {
      const id = `${shape}-${band}`;
      const params = {
        ...spec.params,
        ...(shape === "butterworth" ? { order: 2 } : {}),
        channelScope: "luminance",
      };
      const { size, values } = browserFilter(id).representation(params);
      const top = Math.max(1, ...values);
      const response = createImage(size, size);
      values.forEach((v, i) => {
        const g = Math.round((Math.max(0, v) / top) * 255);
        response.data.set([g, g, g, 255], i * 4);
      });
      figure(id, {
        message: `The ${name} ${spec.title.split(",")[0].toLowerCase()} filter ${spec.message}.`,
        panels: [
          { title: "Zone plate", image: pic(zone) },
          { title: "Response H", image: pic(response) },
          { title: spec.title, image: pic(run(zone, id, params)) },
        ],
      });

      const H = frequencyResponse(id, params);
      const distances = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5];
      example(
        id,
        mdTable(
          ["D (cycles per pixel)", ...distances.map(String)],
          [["H", ...distances.map((d) => fix(H(d, 0), 4))]],
        ) +
          `\nThe response at a few distances from the center of the spectrum, for ${spec.setting}${shape === "butterworth" ? " and order 2" : ""}. ${band.startsWith("band") ? BAND_SHAPE_NOTES[shape] : NOTES[shape]}${BAND_NOTES[band]} In the zone plate of the figure, distance r from its center has frequency r / 160, so D = 0.1 lies 16 pixels from the center.\n`,
      );
    }
  }
}
