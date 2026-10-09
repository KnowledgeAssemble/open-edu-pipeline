export interface SourceManifest {
  id: string; // kebab-case, e.g. "nios-math-level-a"
  title: string;
  format: string; // "markdown" in the slice
  filename: string;
}
