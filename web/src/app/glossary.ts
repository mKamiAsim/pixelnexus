/** Find glossary terms in plain text, for tooltips. Pure, so it is easy to test. */
import { catalog } from "@/catalog";

export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
}

export type Segment = { readonly text: string; readonly entry?: GlossaryEntry };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every term and alias, longest first, so "Support radius" wins over a shorter overlap. */
const names = catalog.glossary
  .flatMap((entry) =>
    [entry.term, ...(entry.aliases ?? [])].map((name) => ({
      name,
      entry: { term: entry.term, definition: entry.definition },
    })),
  )
  .sort((a, b) => b.name.length - a.name.length);

const byName = new Map(names.map((n) => [n.name.toLowerCase(), n.entry]));
const pattern = new RegExp(
  `(?<![\\w-])(${names.map((n) => escape(n.name)).join("|")})(?![\\w-])`,
  "gi",
);

/**
 * Split text into plain parts and glossary terms. Each term is marked only the first time it
 * appears, so a paragraph does not fill up with underlines.
 */
export function glossarySegments(text: string, seen: Set<string> = new Set()): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const found = match[0];
    const entry = byName.get(found.toLowerCase());
    const index = match.index ?? 0;
    if (!entry || seen.has(entry.term)) continue;
    seen.add(entry.term);
    if (index > last) segments.push({ text: text.slice(last, index) });
    segments.push({ text: found, entry });
    last = index + found.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
