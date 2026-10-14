import type { ExtractionResult } from './extraction/types.js';
import type { SourceManifest } from '../ingest/types.js';
import type { SourceDocumentModel, SourceSection } from '../source-model/types.js';
import { parseMarkdown } from '../source-model/normalize.js';

/**
 * Convert an extraction result into the pack-extraction source document model.
 * Page provenance via `sourcePages` is best-effort: it is only populated when the
 * normalized markdown preserves form-feed page breaks.
 */
export function toSourceDocumentModel(
  result: ExtractionResult,
  manifest?: Partial<SourceManifest>,
): SourceDocumentModel {
  const doc = parseMarkdown(result.contentMd);

  if (doc.document.title === '' && manifest?.title) {
    doc.document.title = manifest.title;
  }
  if (manifest?.id) {
    doc.document.id = manifest.id;
  }

  const pages = splitByFormFeed(result.contentMd);
  if (pages.length > 1) {
    assignSourcePages(doc.sections, pages);
  }

  return doc;
}

function splitByFormFeed(contentMd: string): string[] {
  if (!contentMd.includes('\f')) return [contentMd];
  return contentMd.split(/\f/);
}

function assignSourcePages(sections: SourceSection[], pages: string[]): void {
  for (const section of sections) {
    const firstLine = section.lines[0];
    if (!firstLine) continue;
    const pageIndex = pages.findIndex((page) => page.includes(firstLine));
    if (pageIndex >= 0) section.sourcePages = [pageIndex + 1];
  }
}
