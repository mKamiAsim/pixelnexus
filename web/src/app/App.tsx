import { catalog, countBy, STATUS_LABELS } from "@/catalog";

/**
 * Phase 1 foundation screen. It proves that the catalog loads and validates.
 * The real studio shell replaces it in Phase 2.
 */
export function App() {
  const entries = [...catalog.filters, ...catalog.tools];
  const byStatus = countBy(entries, (entry) => entry.status);
  const byFamily = countBy(catalog.filters, (filter) => filter.family);
  const families = [...catalog.families].sort((a, b) => a.order - b.order);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-text">PixelNexus</h1>
        <p className="text-text-secondary">
          Image processing studio for learning and everyday work. This is the foundation build. The
          studio workspace arrives in Phase 2.
        </p>
      </header>

      <section aria-labelledby="catalog-heading" className="flex flex-col gap-3">
        <h2 id="catalog-heading" className="text-lg font-medium text-text">
          Catalog: {entries.length} entries
        </h2>
        <table className="w-full text-sm">
          <caption className="sr-only">Catalog entries by status</caption>
          <tbody>
            {[...byStatus].map(([status, count]) => (
              <tr key={status} className="border-b border-border">
                <th scope="row" className="py-1.5 text-left font-normal text-text-secondary">
                  {STATUS_LABELS[status]}
                </th>
                <td className="py-1.5 text-right tabular-nums">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="families-heading" className="flex flex-col gap-3">
        <h2 id="families-heading" className="text-lg font-medium text-text">
          Filter families
        </h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {families.map((family) => (
            <li key={family.id} className="flex justify-between gap-4 text-text-secondary">
              <span>{family.name}</span>
              <span className="tabular-nums text-text0">{byFamily.get(family.id) ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-sm text-text0">
        Images are processed locally in your browser.
      </footer>
    </main>
  );
}
