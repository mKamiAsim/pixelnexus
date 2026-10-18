import { Copy, ExternalLink } from "lucide-react";
import { Tabs } from "radix-ui";
import { useMemo, useState, type ReactNode } from "react";

import { catalog, isRunnable, modelFor, type Filter } from "@/catalog";
import { fillFormula } from "@/catalog/formula";
import { entryParams } from "@/catalog/params";
import { filterById } from "@/app/filterActions";
import { REPRESENTATION_LABELS, sourceUrl } from "@/app/repo";
import { GlossaryText } from "@/components/GlossaryText";
import { Formula } from "@/components/math/Formula";
import { kernelNumpy } from "@/components/math/kernels";
import { OperatorView } from "@/components/math/OperatorView";
import { ParamControl } from "@/components/params/ParamControl";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { browserFilter } from "@/core/filters/registry";
import { runFilter } from "@/core/filters/run";
import type { Params, Representation } from "@/core/filters/types";
import { disks, hueSweep, ramp, siemensStar } from "@/core/image/synthetic";
import type { RgbaImage } from "@/core/image/types";
import { useEngineRepresentation, type EngineRepresentation } from "@/app/useEngineRepresentation";
import { useFilterValues } from "@/app/useFilterValues";
import { useFilters } from "@/state/filters";
import { notify } from "@/state/notifications";
import { ModelInspector } from "@/panels/ModelInspector";
import { Thumbnail } from "@/panels/Thumbnail";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "formula", label: "Formula" },
  { value: "operator", label: "Operator" },
  { value: "parameters", label: "Parameters" },
  { value: "algorithm", label: "Algorithm" },
  { value: "limits", label: "Limits" },
  { value: "references", label: "References" },
] as const;

const SCOPE_LABELS: Record<string, string> = {
  rgb: "RGB",
  "per-channel": "Each channel separately",
  luminance: "Brightness only",
  chroma: "Color only",
};

function copy(text: string, what: string): void {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => notify("success", `Copied ${what}`))
    .catch(() => notify("error", "Could not copy", "The browser did not allow it."));
}

/** A small test image that shows what the filter does. */
function exampleInput(entry: Filter): RgbaImage {
  const size = 96;
  if (entry.id.startsWith("noise-")) return ramp(size, size);
  if (entry.family === "edges" || entry.id === "laplacian") return disks(size, size);
  if (entry.family === "enhancement") return hueSweep(size, size);
  if (entry.id === "median") {
    const noise = browserFilter("noise-salt-pepper");
    return noise
      ? runFilter(ramp(size, size), noise, { amount: 0.1, seed: 2 }).image
      : ramp(size, size);
  }
  return siemensStar(size, size);
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** The mathematics and the facts of the selected filter. Everything comes from the catalog and the code. */
export function InspectorPanel() {
  const entry = filterById(useFilters((s) => s.selectedId));
  if (!entry) {
    return (
      <p className="p-3 text-sm text-text-secondary">
        Choose a filter in the Library to see its mathematics here.
      </p>
    );
  }
  return <Inspector key={entry.id} entry={entry} />;
}

function Inspector({ entry }: { entry: Filter }) {
  const { values } = useFilterValues(entry);
  const [tab, setTab] = useState<string>("overview");
  const filter = browserFilter(entry.id);
  const engineOperator = useEngineRepresentation(entry, values);
  const browserRepresentation = useMemo<Representation | null>(
    () => (filter && isRunnable(entry) ? filter.representation(values) : null),
    [filter, entry, values],
  );
  const representation =
    browserRepresentation ??
    (engineOperator.status === "ready" ? engineOperator.representation : null);
  const familyName = catalog.families.find((f) => f.id === entry.family)?.name ?? entry.family;
  const modelId = modelFor(entry, values);
  const tabs = modelId ? [...TABS, { value: "model", label: "Model" } as const] : TABS;

  return (
    <Tabs.Root value={tab} onValueChange={setTab} className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-border-subtle px-3 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold">{entry.name}</h3>
          <StatusBadge status={entry.status} />
        </div>
        <p className="pb-1 text-xs text-text-muted">{familyName}</p>
        <Tabs.List aria-label="Inspector sections" className="-mx-3 flex overflow-x-auto px-2">
          {tabs.map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              className="shrink-0 border-b-2 border-transparent px-2 py-1.5 text-xs text-text-muted hover:text-text data-[state=active]:border-accent data-[state=active]:text-text"
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
        <Tabs.Content value="overview" className="flex flex-col gap-3">
          <Overview entry={entry} values={values} />
        </Tabs.Content>
        <Tabs.Content value="formula" className="flex flex-col gap-3">
          <FormulaTab entry={entry} values={values} />
        </Tabs.Content>
        <Tabs.Content value="operator" className="flex flex-col gap-3">
          <OperatorTab
            entry={entry}
            representation={representation}
            engineOperator={engineOperator}
            values={values}
          />
        </Tabs.Content>
        <Tabs.Content value="parameters" className="flex flex-col gap-3">
          <ParametersTab entry={entry} values={values} />
        </Tabs.Content>
        <Tabs.Content value="algorithm" className="flex flex-col gap-3">
          <AlgorithmTab entry={entry} />
        </Tabs.Content>
        <Tabs.Content value="limits" className="flex flex-col gap-3">
          <LimitsTab entry={entry} />
        </Tabs.Content>
        <Tabs.Content value="references" className="flex flex-col gap-3">
          <ReferencesTab entry={entry} />
        </Tabs.Content>
        {modelId ? (
          <Tabs.Content value="model" className="flex flex-col gap-3">
            <ModelInspector key={modelId} modelId={modelId} />
          </Tabs.Content>
        ) : null}
      </div>
    </Tabs.Root>
  );
}

function Planned({ entry }: { entry: Filter }) {
  return (
    <p className="rounded-control border border-border bg-raised p-2.5 text-text-secondary">
      This filter is planned{entry.phase ? ` for Phase ${entry.phase}` : ""}. Its full description
      arrives with its code.
      {entry.planNotes ? ` Notes: ${entry.planNotes}` : ""}
    </p>
  );
}

function Overview({ entry, values }: { entry: Filter; values: Params }) {
  const filter = browserFilter(entry.id);
  const example = useMemo(() => {
    if (!filter || !isRunnable(entry)) return null;
    const input = exampleInput(entry);
    return { input, output: runFilter(input, filter, values).image };
  }, [filter, entry, values]);
  if (!entry.summary) return <Planned entry={entry} />;
  const scopes = entry.channelScopes?.map((s) => SCOPE_LABELS[s] ?? s).join(", ");
  return (
    <>
      <p className="text-sm text-text">
        <GlossaryText text={entry.summary} />
      </p>
      {entry.purpose ? (
        <p className="text-text-secondary">
          <span className="font-medium text-text">Purpose. </span>
          {entry.purpose}
        </p>
      ) : null}
      {entry.learn?.academic ? (
        <p className="text-text-secondary">
          <GlossaryText text={entry.learn.academic} />
        </p>
      ) : null}
      {example ? (
        <figure className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <Thumbnail image={example.input} max={96} label={`Test image before ${entry.name}`} />
            <span aria-hidden className="text-text-muted">
              to
            </span>
            <Thumbnail
              image={example.output}
              max={96}
              label={`The same test image after ${entry.name}`}
            />
          </div>
          <figcaption className="text-2xs text-text-muted">
            Live example on a built-in test image, with the current parameters.
          </figcaption>
        </figure>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {entry.classification ? (
          <>
            <Fact term="Linearity">
              {entry.classification.linearity === "linear" ? "Linear" : "Nonlinear"}
            </Fact>
            <Fact term="Domain">{entry.classification.domain}</Fact>
            <Fact term="Operation">{entry.classification.operation}</Fact>
          </>
        ) : null}
        {entry.output ? <Fact term="Output">{entry.output}</Fact> : null}
        <Fact term="Image types">8-bit RGBA, sRGB. Computed in 32-bit floats inside.</Fact>
        {entry.colorHandling ? (
          <Fact term="Color">
            <GlossaryText text={entry.colorHandling} />
          </Fact>
        ) : null}
        {scopes ? <Fact term="Channels">{scopes}</Fact> : null}
        {entry.boundary ? (
          <Fact term="Boundary">
            <GlossaryText text={entry.boundary} />
          </Fact>
        ) : null}
        {entry.supportRadius ? (
          <Fact term="Support radius">
            <code>{entry.supportRadius}</code>
          </Fact>
        ) : null}
        <Fact term="Engine">
          {entry.engine === "browser"
            ? "Browser engine, PixelNexus code in web/src/core"
            : entry.engine === "science"
              ? "Science engine, PixelNexus code in engine/ that runs on this computer"
              : entry.engine}
        </Fact>
        {entry.implementation ? (
          <Fact term="Source">
            <a
              className="inline-flex items-center gap-1 text-accent-fg hover:underline"
              href={sourceUrl(entry.implementation.path)}
              target="_blank"
              rel="noreferrer"
            >
              <code className="break-all">{entry.implementation.path}</code>
              <ExternalLink size={11} aria-hidden />
            </a>
          </Fact>
        ) : null}
      </dl>
    </>
  );
}

function FormulaTab({ entry, values }: { entry: Filter; values: Params }) {
  if (!entry.formula) return <Planned entry={entry} />;
  const tex = fillFormula(entry.formula, values);
  return (
    <>
      <div className="flex items-center gap-2">
        {entry.representationLabel ? (
          <Badge tone="accent">{REPRESENTATION_LABELS[entry.representationLabel]}</Badge>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => copy(tex, "the formula as LaTeX")}
        >
          <Copy size={12} /> LaTeX
        </Button>
      </div>
      <div className="overflow-x-auto rounded-control border border-border-subtle bg-raised px-2">
        <Formula tex={tex} />
      </div>
      <p className="text-2xs text-text-muted">The formula shows the current parameter values.</p>
      {entry.symbols?.length ? (
        <table className="w-full border-collapse">
          <caption className="pb-1 text-left font-medium text-text-secondary">Symbols</caption>
          <tbody>
            {entry.symbols.map((symbol) => (
              <tr key={symbol.symbol} className="border-t border-border-subtle align-top">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  <Formula tex={symbol.symbol} display={false} />
                </th>
                <td className="py-1 text-text-secondary">
                  <GlossaryText text={symbol.meaning} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {entry.formulaExplanation ? (
        <p className="text-text-secondary">
          <GlossaryText text={entry.formulaExplanation} />
        </p>
      ) : null}
    </>
  );
}

function OperatorTab({
  entry,
  representation,
  engineOperator,
  values,
}: {
  entry: Filter;
  representation: Representation | null;
  engineOperator: EngineRepresentation;
  values: Params;
}) {
  const [order, setOrder] = useState("correlation");
  if (!representation && engineOperator.status !== "none") {
    return <EngineOperatorNote state={engineOperator} />;
  }
  if (!representation) return <Planned entry={entry} />;
  const kernels = representation.kind === "kernels" ? representation.kernels : [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {entry.representationLabel ? (
          <Badge tone="accent">{REPRESENTATION_LABELS[entry.representationLabel]}</Badge>
        ) : null}
        {kernels.length ? (
          <>
            <SegmentedControl
              label="Kernel order"
              value={order}
              onChange={setOrder}
              segments={[
                { value: "correlation", label: "As applied" },
                { value: "convolution", label: "Flipped" },
              ]}
            />
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() =>
                copy(
                  `import numpy as np\n\n${kernels.map(kernelNumpy).join("\n\n")}\n`,
                  "the kernel as NumPy",
                )
              }
            >
              <Copy size={12} /> NumPy
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className={kernels.length ? undefined : "ml-auto"}
          onClick={() =>
            copy(
              JSON.stringify({ filter: entry.id, params: values }, null, 2),
              "the settings as JSON",
            )
          }
        >
          <Copy size={12} /> JSON
        </Button>
      </div>
      {kernels.length ? (
        <p className="text-2xs text-text-muted">
          {order === "correlation"
            ? "PixelNexus applies kernels by correlation, like OpenCV: the kernel is not flipped."
            : "The same kernel flipped in both directions, as a convolution formula would write it."}
        </p>
      ) : null}
      <OperatorView representation={representation} convolution={order === "convolution"} />
      {entry.representationSource ? (
        <p className="text-2xs text-text-muted">
          Built by <code>{entry.representationSource.symbol}</code> in{" "}
          <a
            className="text-accent-fg hover:underline"
            href={sourceUrl(entry.representationSource.path)}
            target="_blank"
            rel="noreferrer"
          >
            <code>{entry.representationSource.path}</code>
          </a>
          , the same code the filter runs.
        </p>
      ) : null}
    </>
  );
}

/** Why the operator of a science filter is not shown yet. */
function EngineOperatorNote({ state }: { state: EngineRepresentation }) {
  const text =
    state.status === "offline"
      ? "The operator comes from the PixelNexus engine, which is not running. Start it with: uv run pixelnexus-engine"
      : state.status === "error"
        ? state.message
        : "Asking the PixelNexus engine for the operator.";
  return (
    <p
      role="status"
      className={
        state.status === "loading"
          ? "text-text-muted"
          : "rounded-control border border-border bg-raised p-2.5 text-text-secondary"
      }
    >
      {text}
    </p>
  );
}

function ParametersTab({ entry, values }: { entry: Filter; values: Params }) {
  const setValue = useFilters((s) => s.setValue);
  const params = entryParams(entry);
  if (params.length === 0) return <Planned entry={entry} />;
  return (
    <ul className="flex flex-col gap-4">
      {params.map((param) => (
        <li key={param.key} className="flex flex-col gap-1.5">
          <ParamControl
            param={param}
            value={values[param.key] ?? param.default}
            onChange={(v) => setValue(entry.id, param.key, v)}
          />
          <p className="text-text-secondary">
            <GlossaryText text={param.description} />
            {param.effect ? ` ${param.effect}` : ""}
          </p>
          <p className="text-2xs text-text-muted">
            Key <code>{param.key}</code>, default{" "}
            {String(param.options?.find((o) => o.value === param.default)?.label ?? param.default)}
            {param.min !== undefined
              ? `, from ${param.min} to ${param.max}${param.unit ? ` ${param.unit}` : ""}`
              : ""}
            {param.oddOnly ? ", odd only" : ""}.
          </p>
        </li>
      ))}
    </ul>
  );
}

function AlgorithmTab({ entry }: { entry: Filter }) {
  if (!entry.steps?.length) return <Planned entry={entry} />;
  return (
    <>
      <ol className="flex list-decimal flex-col gap-1 pl-4 text-text-secondary">
        {entry.steps.map((step) => (
          <li key={step}>
            <GlossaryText text={step} />
          </li>
        ))}
      </ol>
      {entry.pseudocode ? (
        <pre className="overflow-x-auto rounded-control bg-raised p-2 font-mono text-2xs">
          {entry.pseudocode}
        </pre>
      ) : null}
    </>
  );
}

function List({ title, items }: { title: string; items?: readonly string[] }) {
  if (!items?.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <h4 className="font-medium text-text">{title}</h4>
      <ul className="flex list-disc flex-col gap-0.5 pl-4 text-text-secondary">
        {items.map((item) => (
          <li key={item}>
            <GlossaryText text={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LimitsTab({ entry }: { entry: Filter }) {
  if (!entry.complexity) return <Planned entry={entry} />;
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        <dt className="text-text-muted">Time</dt>
        <dd>
          <Formula tex={entry.complexity.time} display={false} />
        </dd>
        <dt className="text-text-muted">Memory</dt>
        <dd>
          <Formula tex={entry.complexity.memory} display={false} />
        </dd>
      </dl>
      {entry.complexity.notes ? (
        <p className="text-text-secondary">{entry.complexity.notes}</p>
      ) : null}
      <List title="Limitations" items={entry.limitations} />
      <List title="Artifacts" items={entry.artifacts} />
      <List title="Advantages" items={entry.advantages} />
      <List title="Use cases" items={entry.useCases} />
    </>
  );
}

function ReferencesTab({ entry }: { entry: Filter }) {
  if (!entry.references?.length) return <Planned entry={entry} />;
  return (
    <>
      <ul className="flex flex-col gap-2">
        {entry.references.map((ref) => (
          <li key={ref.text} className="flex flex-col gap-0.5 text-text-secondary">
            <span>
              <Badge>{ref.kind}</Badge> {ref.text}
            </span>
            {ref.url ? (
              <a
                className="break-all text-accent-fg hover:underline"
                href={ref.url}
                target="_blank"
                rel="noreferrer"
              >
                {ref.url}
              </a>
            ) : null}
            {ref.doi ? (
              <a
                className="text-accent-fg hover:underline"
                href={`https://doi.org/${ref.doi}`}
                target="_blank"
                rel="noreferrer"
              >
                DOI {ref.doi}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {entry.docsPage ? (
        <p className="text-text-muted">The docs page for this filter is docs/{entry.docsPage}.</p>
      ) : null}
    </>
  );
}
