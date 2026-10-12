import { Crosshair } from "lucide-react";
import { useState, type ReactNode } from "react";

import { catalog, isRunnable, type Filter } from "@/catalog";
import { fillFormula } from "@/catalog/formula";
import { entryParams } from "@/catalog/params";
import { filterById, selectFilter } from "@/app/filterActions";
import { useFilterValues } from "@/app/useFilterValues";
import { showPanel } from "@/app/layout";
import { GlossaryText } from "@/components/GlossaryText";
import { Formula } from "@/components/math/Formula";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { isSelectionTool } from "@/selection/ids";
import { toolEntry, useToolValues } from "@/selection/values";
import { activeDocument, useDocuments } from "@/state/documents";
import type { Params } from "@/core/filters/types";
import { useFilters } from "@/state/filters";
import { useUi } from "@/state/ui";

import { LATER_DEMOS, WIDGETS } from "./registry";

type Level = "basic" | "academic";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-border-subtle px-3 py-3">
      <h4 className="text-xs font-semibold text-text">{title}</h4>
      <div className="flex flex-col gap-1.5 text-xs text-text-secondary">{children}</div>
    </section>
  );
}

/**
 * The teacher: what a filter does, in plain words, with live demos on your own image. While a
 * selection tool is active, its lesson comes first.
 */
export function LearnPanel() {
  const entry = filterById(useFilters((s) => s.selectedId));
  const tool = useUi((s) => s.tool);
  const [level, setLevel] = useState<Level>("basic");
  const toolLesson = isSelectionTool(tool) ? <ToolLesson tool={tool} level={level} /> : null;
  if (!entry) {
    return (
      <div className="flex flex-col">
        {toolLesson}
        <p className="p-3 text-sm text-text-secondary">
          Choose a filter in the Library. This panel then explains it on your image.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {toolLesson}
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <h3 className="truncate text-base font-semibold">{entry.name}</h3>
        <SegmentedControl
          label="Level of detail"
          value={level}
          onChange={(value) => setLevel(value as Level)}
          segments={[
            { value: "basic", label: "Basic" },
            { value: "academic", label: "Academic" },
          ]}
        />
      </div>
      {entry.learn ? (
        <Lesson entry={entry} level={level} />
      ) : (
        <p className="p-3 text-sm text-text-secondary">
          This filter is planned{entry.phase ? ` for Phase ${entry.phase}` : ""}. Its lesson arrives
          with its code.
        </p>
      )}
    </div>
  );
}

function Lesson({ entry, level }: { entry: Filter; level: Level }) {
  const learn = entry.learn;
  const { values } = useFilterValues(entry);
  if (!learn) return null;
  const params = entryParams(entry);
  const related = (entry.related ?? [])
    .map((id) => catalog.filters.find((f) => f.id === id))
    .filter((f): f is Filter => Boolean(f));

  return (
    <>
      <Section title="In one sentence">
        <p className="text-sm text-text">
          <GlossaryText text={learn.oneSentence} />
        </p>
      </Section>
      <Section title="How it works">
        <ol className="flex list-decimal flex-col gap-1 pl-4">
          {learn.howItWorks.map((step) => (
            <li key={step}>
              <GlossaryText text={step} />
            </li>
          ))}
        </ol>
        {level === "academic" ? (
          <>
            {learn.academic ? (
              <p>
                <GlossaryText text={learn.academic} />
              </p>
            ) : null}
            {entry.formula ? (
              <div className="overflow-x-auto rounded-control bg-raised px-2">
                <Formula tex={fillFormula(entry.formula, values)} />
              </div>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => showPanel("inspector")}
            >
              Every symbol and the operator are in the Inspector
            </Button>
          </>
        ) : null}
      </Section>
      {isRunnable(entry) && learn.demos.length > 0 ? <Demos entry={entry} values={values} /> : null}
      {learn.paramNotes && Object.keys(learn.paramNotes).length > 0 ? (
        <Section title="What the parameters do">
          <dl className="flex flex-col gap-1.5">
            {params
              .filter((p) => learn.paramNotes?.[p.key])
              .map((p) => (
                <div key={p.key}>
                  <dt className="font-medium text-text">
                    {p.label}:{" "}
                    <span className="tabular font-normal text-text-secondary">
                      {String(
                        p.options?.find((o) => o.value === values[p.key])?.label ?? values[p.key],
                      )}
                      {p.unit && p.type !== "select" ? ` ${p.unit}` : ""}
                    </span>
                  </dt>
                  <dd>
                    <GlossaryText text={learn.paramNotes?.[p.key] ?? ""} />
                  </dd>
                </div>
              ))}
          </dl>
        </Section>
      ) : null}
      {learn.tryThis?.length ? (
        <Section title="Try this">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {learn.tryThis.map((item) => (
              <li key={item}>
                <GlossaryText text={item} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {learn.pitfalls?.length ? (
        <Section title="Common mistakes">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {learn.pitfalls.map((item) => (
              <li key={item}>
                <GlossaryText text={item} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title="Where to go next">
        {related.length ? (
          <div className="flex flex-wrap gap-1">
            {related.map((f) => (
              <Button key={f.id} size="sm" onClick={() => selectFilter(f.id)}>
                {f.name}
              </Button>
            ))}
          </div>
        ) : null}
        {entry.docsPage ? (
          <p>The docs page is docs/{entry.docsPage}, with the derivation and a worked example.</p>
        ) : null}
      </Section>
    </>
  );
}

function Demos({ entry, values }: { entry: Filter; values: Params }) {
  const doc = useDocuments((s) => activeDocument(s));
  const probe = useUi((s) => s.probe);
  const setProbe = useUi((s) => s.setProbe);
  const setTool = useUi((s) => s.setTool);
  const demos = entry.learn?.demos ?? [];
  if (!doc) {
    return (
      <Section title="See it on your image">
        <p>Open an image to run the demos on it.</p>
      </Section>
    );
  }
  const image = doc.current;
  const point =
    probe && probe.documentId === doc.id && probe.x < image.width && probe.y < image.height
      ? { x: probe.x, y: probe.y }
      : { x: image.width >> 1, y: image.height >> 1 };
  const move = (p: { x: number; y: number }) => setProbe({ documentId: doc.id, ...p });
  return (
    <Section title="See it on your image">
      <p className="flex flex-wrap items-center gap-1.5">
        The demos use the pixel at x {point.x}, y {point.y}.
        <button
          type="button"
          className="inline-flex items-center gap-1 text-accent-fg hover:underline"
          onClick={() => setTool("probe")}
        >
          <Crosshair size={12} /> Pick another with the Probe tool (I)
        </button>
      </p>
      {demos.map((demo) => {
        const widget = WIDGETS[demo as keyof typeof WIDGETS];
        if (!widget) {
          return (
            <p key={demo} className="text-text-muted">
              The {demo.replace(/-/g, " ")} demo arrives in Phase {LATER_DEMOS[demo] ?? "later"}.
            </p>
          );
        }
        const Widget = widget.component;
        return (
          <div
            key={demo}
            className="flex flex-col gap-1.5 rounded-control border border-border-subtle p-2"
          >
            <h5 className="text-xs font-medium text-text">{widget.title}</h5>
            <Widget filterId={entry.id} values={values} image={image} point={point} onMove={move} />
          </div>
        );
      })}
    </Section>
  );
}

/** The lesson for a selection tool, from its catalog entry. */
function ToolLesson({ tool, level }: { tool: string; level: Level }) {
  const entry = toolEntry(tool);
  const values = useToolValues(tool);
  const learn = entry?.learn;
  if (!entry || !learn) return null;
  const notes = entryParams(entry).filter((p) => learn.paramNotes?.[p.key]);
  return (
    <div className="border-b-4 border-border-subtle">
      <div className="border-b border-border-subtle px-3 py-2">
        <p className="text-2xs font-medium text-text-muted uppercase">Selection tool</p>
        <h3 className="text-base font-semibold">{entry.name}</h3>
      </div>
      <Section title="In one sentence">
        <p className="text-sm text-text">
          <GlossaryText text={learn.oneSentence} />
        </p>
      </Section>
      <Section title="How it works">
        <ol className="flex list-decimal flex-col gap-1 pl-4">
          {learn.howItWorks.map((step) => (
            <li key={step}>
              <GlossaryText text={step} />
            </li>
          ))}
        </ol>
        {level === "academic" && learn.academic ? (
          <p>
            <GlossaryText text={learn.academic} />
          </p>
        ) : null}
      </Section>
      {notes.length > 0 ? (
        <Section title="What the settings do">
          <dl className="flex flex-col gap-1.5">
            {notes.map((p) => (
              <div key={p.key}>
                <dt className="font-medium text-text">
                  {p.label}:{" "}
                  <span className="tabular font-normal text-text-secondary">
                    {String(
                      p.options?.find((o) => o.value === values[p.key])?.label ??
                        (typeof values[p.key] === "boolean"
                          ? values[p.key]
                            ? "on"
                            : "off"
                          : values[p.key]),
                    )}
                    {p.unit && p.type !== "select" ? ` ${p.unit}` : ""}
                  </span>
                </dt>
                <dd>
                  <GlossaryText text={learn.paramNotes?.[p.key] ?? ""} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
      {learn.tryThis?.length ? (
        <Section title="Try this">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {learn.tryThis.map((item) => (
              <li key={item}>
                <GlossaryText text={item} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {learn.pitfalls?.length ? (
        <Section title="Common mistakes">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {learn.pitfalls.map((item) => (
              <li key={item}>
                <GlossaryText text={item} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {entry.docsPage ? (
        <Section title="Where to go next">
          <p>The docs page is docs/{entry.docsPage}, with the maths and the tests.</p>
        </Section>
      ) : null}
    </div>
  );
}
