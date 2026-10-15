/**
 * The features found on the active image by a feature detector, such as blobs: a table with
 * the first rows, CSV export, and a switch for the drawing on the canvas.
 */
import { download } from "@/app/download";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { tableToCsv } from "@/core/features/table";
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
        Run a feature detector, such as LoG blob detection, to list what it finds here.
      </p>
    );
  }
  const { table } = layer;
  const stale = layer.source !== doc.current;
  const exportCsv = () => {
    const blob = new Blob([tableToCsv(table)], { type: "text/csv" });
    const name = `${baseName(doc.name)}_${layer.filterId}.csv`;
    download(blob, name);
    announce(`Saved ${table.rows.length} rows as ${name}.`);
  };
  const shown = table.rows.slice(0, SHOWN_ROWS);
  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{layer.label}</span>
        <span className="text-text-secondary">{table.summary}</span>
      </div>
      {stale ? (
        <p className="text-text-secondary">
          The image has changed since these features were found, so the canvas no longer shows them.
          Run the detector again to update them.
        </p>
      ) : (
        <Switch label="Show on the canvas" checked={visible} onChange={setVisible} />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={exportCsv} disabled={table.rows.length === 0}>
          Export CSV
        </Button>
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
                <td className="py-1 pr-2 text-text-muted">{i + 1}</td>
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
          The table shows the first {SHOWN_ROWS} of {table.rows.length} rows, with the strongest
          first. The CSV file has all of them.
        </p>
      ) : null}
      <p className="text-text-muted">
        x is the column and y the row of the pixel at the center of each feature, counted from 0 at
        the top left.
      </p>
    </div>
  );
}
