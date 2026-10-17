/**
 * The Model tab of the Inspector (PLAN.md Phase 7): the model card from catalog/models.yaml and
 * the real input and output tensors, which the engine reads from the downloaded files. Nothing
 * here is typed by hand: shapes come from the files, and every other fact from the catalog.
 */
import type { ReactNode } from "react";

import { catalog } from "@/catalog";
import { Badge } from "@/components/ui/Badge";
import { formatShape, useModelTensors } from "@/app/useModelTensors";
import { runsOnDevice } from "@/core/ai/ondevice/store";
import type { TensorInfo } from "@/engine-client/science";

const FORMATS: Record<string, string> = {
  onnx: "ONNX",
  pytorch: "PyTorch weights, exported to ONNX on this computer",
  "tensorflow-pb": "TensorFlow graph, run by OpenCV",
  caffe: "Caffe weights, exported to ONNX on this computer",
  "opencv-yml": "OpenCV model file",
};

/** Only ONNX files run in the browser, whatever the catalog plans for later. */
const RUNTIMES: Record<string, string> = {
  engine: "the local engine",
  "on-device": "the browser",
};

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function TensorTable({ title, tensors }: { title: string; tensors: readonly TensorInfo[] }) {
  return (
    <table className="w-full text-left">
      <caption className="text-left font-medium text-text-secondary">{title}</caption>
      <thead>
        <tr className="text-text-muted">
          <th className="pr-2 font-normal">Name</th>
          <th className="pr-2 font-normal">Type</th>
          <th className="font-normal">Shape</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {tensors.map((t) => (
          <tr key={t.name}>
            <td className="pr-2 break-all">{t.name}</td>
            <td className="pr-2">{t.type}</td>
            <td>{formatShape(t.shape)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ModelInspector({ modelId }: { modelId: string }) {
  const model = catalog.models.find((m) => m.id === modelId);
  const tensors = useModelTensors(modelId);

  if (!model) return null;
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <Fact term="Model">{model.name}</Fact>
        <Fact term="Format">{FORMATS[model.format] ?? model.format}</Fact>
        <Fact term="Size">{model.sizeMB} MB</Fact>
        <Fact term="Runs in">
          {model.runtimes
            .filter((r) => r !== "on-device" || runsOnDevice(model))
            .map((r) => RUNTIMES[r] ?? r)
            .join(" and ")}
        </Fact>
        <Fact term="License">
          {model.licenseUrl ? (
            <a
              className="text-accent-fg hover:underline"
              href={model.licenseUrl}
              target="_blank"
              rel="noreferrer"
            >
              {model.license}
            </a>
          ) : (
            model.license
          )}
          {model.nonCommercial ? (
            <>
              {" "}
              <Badge>non-commercial</Badge>
            </>
          ) : null}
        </Fact>
        {model.inputs ? <Fact term="Takes">{model.inputs}</Fact> : null}
        {model.outputs ? <Fact term="Gives">{model.outputs}</Fact> : null}
        {model.reference ? (
          <Fact term="Paper">
            {model.reference.text}
            {model.reference.doi ? (
              <>
                {" "}
                <a
                  className="text-accent-fg hover:underline"
                  href={`https://doi.org/${model.reference.doi}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  DOI {model.reference.doi}
                </a>
              </>
            ) : null}
          </Fact>
        ) : null}
      </dl>
      <section aria-labelledby={`tensors-${model.id}`} className="flex flex-col gap-2">
        <h4 id={`tensors-${model.id}`} className="font-medium text-text">
          Tensors
        </h4>
        {tensors.kind === "loading" ? (
          <p className="text-text-muted">Reading the model files.</p>
        ) : null}
        {tensors.kind === "unavailable" ? (
          <p className="text-text-muted">{tensors.message}</p>
        ) : null}
        {tensors.kind === "ready" && tensors.value.files.length === 0 ? (
          <p className="text-text-muted">This format has no ONNX file to read the tensors from.</p>
        ) : null}
        {tensors.kind === "ready"
          ? tensors.value.files.map((file) => (
              <div key={file.file} className="flex flex-col gap-1.5">
                <p className="font-mono text-text-secondary">{file.file}</p>
                <TensorTable title="Inputs" tensors={file.inputs} />
                <TensorTable title="Outputs" tensors={file.outputs} />
              </div>
            ))
          : null}
        <p className="text-text-muted">
          Read from the downloaded files. A name in a shape, such as height, is a size that the
          network accepts freely.
        </p>
      </section>
    </>
  );
}
