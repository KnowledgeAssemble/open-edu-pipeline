export interface SourceManifest {
  id: string; // kebab-case, e.g. "nios-math-level-a"
  title: string;
  format: string; // e.g. "markdown", "pdf"
  filename: string;
  // Optional generic-pipeline fields (backwards compatible with the slice).
  subject?: string;
  level?: string;
  language?: string;
  parser?: string; // e.g. "liteparse"
  pages?: number;
}
