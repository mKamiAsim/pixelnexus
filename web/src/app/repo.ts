/** Links into the source repository. Paths are repo-relative, never local file paths. */
export const REPO_URL = "https://github.com/mKamiAsim/pixelnexus";

export function sourceUrl(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}

export const REPRESENTATION_LABELS: Readonly<Record<string, string>> = {
  exact: "Exact computation",
  definition: "Mathematical definition",
  approximation: "Approximation",
  simplified: "Simplified explanation",
};
