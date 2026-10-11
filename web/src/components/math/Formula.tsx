import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

/**
 * Render LaTeX with KaTeX. KaTeX also writes MathML, so screen readers can read the formula.
 * Errors are shown in place instead of breaking the panel.
 */
export function Formula({ tex, display = true }: { tex: string; display?: boolean }) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        output: "htmlAndMathml",
      }),
    [tex, display],
  );
  return (
    <div
      className="overflow-x-auto py-1 text-text [&_.katex]:text-[1.05em]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
