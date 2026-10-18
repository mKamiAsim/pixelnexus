/**
 * The features found on the active image by a feature detector, such as blobs: a table with
 * the first rows, CSV export, and a switch for the drawing on the canvas. For the regions of a
 * segmentation, each row can also become the selection, or all of them at once.
 */
import { download } from "@/app/download";
import { commitSelection } from "@/app/selectionActions";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { labelMask } from "@/core/features/labels";
import { hasPoints, tableToCsv } from "@/core/features/table";
import { activeDocument, useDocuments } from "@/state/documents";
import { useFeatures } from "@/state/features";
import { announce } from "@/state/notifications";

/** The table shows this many rows. The CSV file has all of them. */
export const SHOWN_ROWS = 200;

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

export function FeaturesPanel() {
  const doc = useDocuments((s) => activeDocument(s));
  const layer = useFeatures((s) => (doc ? s.layers[doc.id] : undefined));
  const visible = useFeatures((s) => s.visible);
  const { setVisible, clear } = useFeatures.getState();

  if (!doc || !layer) {
    return (
      <p className="p-3 text-xs text-text-secondary">
        Run a feature detector or a segmentation, such as LoG blob detection or SLIC superpixels, to
        list what it finds here.
      </p>
    );
  }
  const { table } = layer;
  const points = hasPoints(table);
  const stale = layer.source !== doc.current;
  const exportCsv = () => {
    const blob = new Blob([tableToCsv(table)], { type: "text/csv" });
    const name = `${baseName(doc.name)}_${layer.filterId}.csv`;
    download(blob, name);
    announce(`Saved ${table.rows.length} rows as ${name}.`);
  };
  const shown = table.rows.slice(0, SHOWN_ROWS);
  const { labels } = layer;
  // Regions can become the selection while the image keeps their size.
  const selectable =
    labels && labels.width === doc.current.width && labels.height === doc.current.height
      ? labels
      : null;
  const labelColumn = table.columns.findIndex((c) => c.key === "label");
  const selectRegions = (which: ReadonlySet<number> | "all", name: string) => {
    if (!selectable) return;
    commitSelection(doc.id, labelMask(selectable, which), name);
  };
  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{layer.label}</span>
        <span className="text-text-secondary">{table.summary}</span>
      </div>
      {stale ? (
        <p className="text-text-secondary">
          {points
            ? "The image has changed since these features were found, so the canvas no longer shows them. Run the detector again to update them."
            : "The image has changed since this table was made. Run the filter again to update it."}
        </p>
      ) : points ? (
        <Switch label="Show on the canvas" checked={visible} onChange={setVisible} />
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={exportCsv} disabled={table.rows.length === 0}>
          Export CSV
        </Button>
        {selectable ? (
          <Button size="sm" onClick={() => selectRegions("all", "Select all regions")}>
            Select all regions
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => clear(doc.id)}>
          Clear
        </Button>
      </div>
      {table.rows.length > 0 ? (
        <table className="tabular w-full border-collapse" aria-label="Features">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-2 text-left font-medium">
                #
              </th>
              {table.columns.map((c) => (
                <th key={c.key} scope="col" className="py-1 pr-2 text-right font-medium">
                  {c.label}
                  {c.unit ? <span className="text-text-muted"> ({c.unit})</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="border-t border-border-subtle">
                <td className="py-1 pr-2 text-text-muted">
                  {selectable && labelColumn >= 0 ? (
                    <button
                      type="button"
                      className="underline decoration-dotted hover:text-text-primary"
                      aria-label={`Select region ${row[labelColumn] ?? 0}`}
                      onClick={() => {
                        const label = row[labelColumn] ?? 0;
                        selectRegions(new Set([label]), `Select region ${label}`);
                      }}
                    >
                      {i + 1}
                    </button>
                  ) : (
                    i + 1
                  )}
                </td>
                {row.map((value, j) => (
                  <td key={j} className="py-1 pr-2 text-right font-mono">
                    {Number.isInteger(value) ? value : Number(value.toPrecision(4))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {table.rows.length > SHOWN_ROWS ? (
        <p className="text-text-muted">
          The table shows the first {SHOWN_ROWS} of {table.rows.length} rows
          {points ? ", with the strongest first" : ""}. The CSV file has all of them.
        </p>
      ) : null}
      <p className="text-text-muted">
        {labels
          ? "Each row is a region, with its area, its centroid and its mean brightness. Click a row number to make that region the selection. x and y count from the center of the top-left pixel."
          : points
            ? "x and y give the position of each feature in pixels, with the center of the top-left pixel at 0, 0."
            : "The table describes the whole image."}
      </p>
    </div>
  );
}
