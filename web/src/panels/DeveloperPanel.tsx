import { ChevronRight, Copy, ExternalLink } from "lucide-react";
import { Collapsible } from "radix-ui";
import type { ReactNode } from "react";

import { isRunnable, type Filter } from "@/catalog";
import { entryParams } from "@/catalog/params";
import { filterById } from "@/app/filterActions";
import { formatBytes } from "@/app/format";
import { sourceUrl } from "@/app/repo";
import { Button } from "@/components/ui/Button";
import { luma709 } from "@/core/color/convert";
import { borderIndex } from "@/core/filters/planes";
import { browserFilter } from "@/core/filters/registry";
import { borderOf, fullRect, processRegion, scopeOf } from "@/core/filters/run";
import type { Params } from "@/core/filters/types";
import { hasTransparency } from "@/core/image/encode";
import type { RgbaImage } from "@/core/image/types";
import { estimateJobBytes, memoryBudget } from "@/engine-client/browser";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFilterValues } from "@/app/useFilterValues";
import { useFilters } from "@/state/filters";
import { notify } from "@/state/notifications";
import { useUi } from "@/state/ui";

function copy(text: string, what: string): void {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => notify("success", `Copied ${what}`))
    .catch(() => notify("error", "Could not copy", "The browser did not allow it."));
}

function Section({
  title,
  children,
  open = true,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <Collapsible.Root defaultOpen={open} className="border-b border-border-subtle">
      <Collapsible.Trigger className="group flex h-7 w-full items-center gap-1 px-2 text-left text-xs font-medium text-text-secondary hover:text-text">
        <ChevronRight
          size={12}
          className="text-text-muted transition-transform group-data-[state=open]:rotate-90"
        />
        {title}
      </Collapsible.Trigger>
      <Collapsible.Content className="flex flex-col gap-2 px-3 pb-3 text-xs">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-control bg-raised p-2 font-mono text-2xs leading-4">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function SourceLink({ path, symbol }: { path: string; symbol?: string }) {
  return (
    <a
      className="inline-flex items-center gap-1 break-all text-accent-fg hover:underline"
      href={sourceUrl(path)}
      target="_blank"
      rel="noreferrer"
    >
      <code>{path}</code>
      {symbol ? <code>({symbol})</code> : null}
      <ExternalLink size={11} aria-hidden className="shrink-0" />
    </a>
  );
}

/** The value a filter reads at an image position: the channel, or luma for the brightness scope. */
function readValue(image: RgbaImage, x: number, y: number, luma: boolean): number {
  const o = (y * image.width + x) * 4;
  const r = image.data[o] ?? 0;
  if (!luma) return r;
  return luma709(r, image.data[o + 1] ?? 0, image.data[o + 2] ?? 0);
}

/**
 * Weights times window values at one pixel, next to the filter's own result there. It shows the
 * kernel at work on real numbers.
 */
function NumericExample({
  entry,
  values,
  image,
}: {
  entry: Filter;
  values: Params;
  image: RgbaImage;
}) {
  const probe = useUi((s) => s.probe);
  const filter = browserFilter(entry.id);
  const representation = filter?.representation(values);
  const kernels = representation?.kind === "kernels" ? representation.kernels : [];
  const kernel = kernels[0];
  if (!filter || !kernel) {
    return (
      <p className="text-text-secondary">
        This filter has no kernel. The Learn panel shows a worked example.
      </p>
    );
  }
  if (kernel.rows.length > 7) {
    return (
      <p className="text-text-secondary">
        The kernel is larger than 7x7, so the example is left out. The Learn panel has a smaller
        one.
      </p>
    );
  }
  const x = probe ? Math.min(probe.x, image.width - 1) : Math.floor(image.width / 2);
  const y = probe ? Math.min(probe.y, image.height - 1) : Math.floor(image.height / 2);
  const luma = scopeOf(values) === "luminance";
  const border = borderOf(values);
  const rows = kernel.rows.map((row, j) =>
    row.map((_w, i) => {
      const sx = borderIndex(x + i - kernel.anchor.x, image.width, border);
      const sy = borderIndex(y + j - kernel.anchor.y, image.height, border);
      return sx < 0 || sy < 0 ? 0 : readValue(image, sx, sy, luma);
    }),
  );
  const sum = rows.reduce(
    (total, row, j) => total + row.reduce((s, v, i) => s + v * (kernel.rows[j]?.[i] ?? 0), 0),
    0,
  );
  // With two kernels (Sobel), compare the first one with the matching output.
  const engineValues =
    kernels.length > 1 && "output" in values ? { ...values, output: "gx" } : values;
  const transparent = hasTransparency(image);
  const result = processRegion(
    image,
    filter,
    engineValues,
    { x, y, width: 1, height: 1 },
    transparent,
  );
  const engineValue = result.color[0].data[0] ?? 0;
  return (
    <>
      <p className="text-text-secondary">
        Pixel x {x}, y {y}, {luma ? "luma" : "red channel"}.{" "}
        {probe ? "" : "Pin a pixel with the Probe tool to choose another one."}
      </p>
      <table className="tabular border-collapse font-mono text-2xs">
        <caption className="pb-1 text-left font-sans text-text-muted">Window values</caption>
        <tbody>
          {rows.map((row, j) => (
            <tr key={j}>
              {row.map((v, i) => (
                <td key={i} className="border border-border-subtle px-1.5 py-0.5 text-right">
                  {Number(v.toFixed(1))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Sum of weight times value: <strong className="tabular">{sum.toFixed(3)}</strong>. The filter
        code gives <strong className="tabular">{engineValue.toFixed(3)}</strong> for the same pixel
        {engineValues !== values ? ", as Gx for the first kernel" : ""}.
      </p>
      {values.linearLight === true || transparent || Number(values.threshold ?? 0) > 0 ? (
        <p className="text-text-muted">
          The two numbers can differ here, because{" "}
          {values.linearLight === true
            ? "the filter works on linear light values"
            : transparent
              ? "the image has transparency and the filter weights colors by alpha"
              : "the threshold leaves small details unchanged"}
          .
        </p>
      ) : null}
    </>
  );
}

/** Implementation facts for developers. It shows repository paths only, never local paths. */
export function DeveloperPanel() {
  const entry = filterById(useFilters((s) => s.selectedId));
  if (!entry)
    return (
      <p className="p-3 text-sm text-text-secondary">
        Choose a filter in the Library to see its developer facts.
      </p>
    );
  return <Developer key={entry.id} entry={entry} />;
}

function Developer({ entry }: { entry: Filter }) {
  const { values, warnings } = useFilterValues(entry);
  const lastRun = useFilters((s) => s.lastRun[entry.id]);
  const preview = useFilters((s) => s.preview);
  const doc = useDocuments((s) => activeDocument(s));
  const filter = browserFilter(entry.id);
  const params = entryParams(entry);
  const config = { filter: entry.id, params: values };
  const symbols = (entry.symbols ?? []).map((s) => `- $${s.symbol}$: ${s.meaning}`).join("\n");
  const mathText = entry.formula
    ? `# ${entry.name}\n\n$$\n${entry.formula.trim()}\n$$\n\nwhere\n\n${symbols}\n`
    : "";
  const halo = filter?.radius(values) ?? 0;
  const allWarnings = [...warnings, ...(preview.status === "ready" ? preview.warnings : [])];

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
        <code className="text-sm font-semibold">{entry.id}</code>
        <span className="text-xs text-text-muted">
          {entry.engine === "browser" ? "Browser engine" : entry.engine}
        </span>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copy(JSON.stringify(config, null, 2), "the configuration as JSON")}
          >
            <Copy size={12} /> JSON
          </Button>
          {mathText ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copy(mathText, "the mathematical description")}
            >
              <Copy size={12} /> Maths
            </Button>
          ) : null}
        </div>
      </div>

      <Section title="Current configuration">
        <Json value={config} />
      </Section>

      <Section title="Code">
        {entry.implementation ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-text-muted">Filter</dt>
            <dd>
              <SourceLink path={entry.implementation.path} symbol={entry.implementation.symbol} />
            </dd>
            {entry.representationSource ? (
              <>
                <dt className="text-text-muted">Operator</dt>
                <dd>
                  <SourceLink
                    path={entry.representationSource.path}
                    symbol={entry.representationSource.symbol}
                  />
                </dd>
              </>
            ) : null}
            <dt className="text-text-muted">Framework</dt>
            <dd>
              <SourceLink path="web/src/core/filters/run.ts" />
            </dd>
          </dl>
        ) : (
          <p className="text-text-secondary">
            No code yet. This filter is planned{entry.phase ? ` for Phase ${entry.phase}` : ""}.
          </p>
        )}
        <p className="text-text-secondary">
          Dependencies: none. The browser filters are PixelNexus code and run in Web Workers. Their
          tests compare them with SciPy, scikit-image and OpenCV.
        </p>
      </Section>

      <Section title="Data types and conversions">
        <ul className="flex list-disc flex-col gap-1 pl-4 text-text-secondary">
          <li>Input: 8-bit RGBA, sRGB encoded, straight alpha.</li>
          <li>
            Inside: one 32-bit float plane per channel, values 0 to 255. Sums run in 64-bit floats.
          </li>
          <li>
            Channels:{" "}
            {scopeOf(values) === "luminance"
              ? "BT.709 luma only, color differences kept."
              : scopeOf(values) === "chroma"
                ? "color differences only, luma kept."
                : "red, green and blue one after the other."}
            {values.linearLight === true ? " Values are decoded to linear light first." : ""}
          </li>
          <li>
            Output: {entry.output ?? "image"}, 8-bit RGBA of the same size. Alpha is kept. Rounded
            once at the end.
          </li>
          <li>Support radius for these values: {halo} pixels.</li>
        </ul>
      </Section>

      <Section title="Timing and memory">
        {lastRun ? (
          <p className="text-text-secondary">
            Last {lastRun.kind}: {Math.round(lastRun.totalMs)} ms in total,{" "}
            {Math.round(lastRun.computeMs)} ms of filter time over {lastRun.tiles} tiles on{" "}
            {lastRun.workers} workers.
          </p>
        ) : (
          <p className="text-text-muted">Not run yet in this session.</p>
        )}
        {doc && filter ? (
          <p className="text-text-secondary">
            A full run on the active {doc.current.width} x {doc.current.height} image needs about{" "}
            {formatBytes(estimateJobBytes(fullRect(doc.current), halo, 4))} with 4 workers. The
            budget on this device is {formatBytes(memoryBudget())}.
          </p>
        ) : null}
      </Section>

      <Section title="Warnings">
        {allWarnings.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-4 text-text-secondary">
            {allWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="text-text-muted">None for the current values.</p>
        )}
      </Section>

      {doc && isRunnable(entry) ? (
        <Section title="Numeric example">
          <NumericExample entry={entry} values={values} image={doc.current} />
        </Section>
      ) : null}

      <Section title="Tests" open={false}>
        {entry.tests?.length ? (
          <ul className="flex flex-col gap-1">
            {entry.tests.map((t) => (
              <li key={t}>
                <SourceLink path={t} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-muted">No tests yet.</p>
        )}
      </Section>

      <Section title="Formula source" open={false}>
        {entry.formula ? (
          <pre className="overflow-auto rounded-control bg-raised p-2 font-mono text-2xs">
            {entry.formula}
          </pre>
        ) : (
          <p className="text-text-muted">No formula yet.</p>
        )}
      </Section>

      <Section title="Parameter schema" open={false}>
        <Json value={params} />
      </Section>

      <Section title="Filter definition" open={false}>
        <Json value={entry} />
      </Section>
    </div>
  );
}
