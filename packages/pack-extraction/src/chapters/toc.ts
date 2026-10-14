const TOC_HEADING_RE = /^(?:#{1,6}\s*)?(contents|table of contents)\s*$/i;
const TOC_ENTRY_PREFIX_RE = /^(UNIT|CHAPTER|LESSON|MODULE)\b/i;
const TOC_ENTRY_NUMBER_RE = /^\d+[.:)]?\s+\S/;
const PROSE_RE = /[a-z]{3,}[.!?]\s+[A-Z]/;

/** Split normalized markdown into pages on form-feed characters (best effort). */
export function splitPages(markdown: string): string[] {
  if (!markdown.includes('\f')) return [markdown];
  return markdown.split(/\f/);
}

/**
 * A page is TOC-like when more than 60% of its non-empty lines look like short
 * numbered or titled list entries and there is little connective prose.
 */
export function isTocPage(pageContent: string): boolean {
  const lines = pageContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return false;
  if (lines.some((line) => TOC_HEADING_RE.test(line))) return true;

  const structured = lines.filter((line) => {
    const plain = line.replace(/^#{1,6}\s*/, '').replace(/^[*|•-]\s*/, '');
    if (plain.length === 0 || plain.length > 90) return false;
    return (
      TOC_ENTRY_PREFIX_RE.test(plain) ||
      TOC_ENTRY_NUMBER_RE.test(plain) ||
      /^(.+)\.{2,}\s*\d+$/.test(plain) ||
      /\s{2,}\d+$/.test(line)
    );
  });

  const proseLines = lines.filter((line) => PROSE_RE.test(line));
  const ratio = structured.length / lines.length;
  return ratio > 0.6 && proseLines.length <= Math.max(1, Math.floor(lines.length * 0.2));
}

/** Return 1-based page indices that look like a table of contents. */
export function detectTocPages(pages: string[]): number[] {
  const indices: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    if (isTocPage(pages[index] ?? '')) indices.push(index + 1);
    // Only the leading front matter can hold the TOC; stop scanning once body
    // content has clearly begun (a few non-TOC pages in a row).
    if (indices.length === 0 && index > 12) break;
  }
  return indices;
}

/** Parse a `--toc-pages` range such as `12`, `12-14`, or `12..14` into 1-based bounds. */
export function parsePageRange(range: string): { start: number; end: number } | null {
  const trimmed = range.trim();
  const match = /^(\d+)\s*(?:[-.]{1,2}\s*(\d+))?$/.exec(trimmed);
  if (!match) return null;
  const start = Number.parseInt(match[1] ?? '', 10);
  const end = match[2] !== undefined ? Number.parseInt(match[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return null;
  return { start, end };
}

/**
 * Extract candidate chapter titles from TOC page text. Lines are kept when they
 * look like a titled or numbered entry, and trailing page numbers / dot leaders
 * are stripped.
 */
export function parseTocEntries(tocText: string): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();

  for (const raw of tocText.split('\n')) {
    let line = raw.replace(/^#{1,6}\s*/, '').trim();
    if (line === '') continue;
    if (TOC_HEADING_RE.test(raw.trim())) continue;
    line = line.replace(/^[*|•-]\s*/, '');
    line = line.replace(/\s*\.{2,}\s*\d+\s*$/, '');
    line = line.replace(/\s+\d+\s*$/, '').trim();
    line = line.replace(/^\d+\s*[.:)]?\s*/, '').trim();
    if (line.length < 3 || line.length > 120) continue;
    if (PROSE_RE.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(line);
  }

  return entries;
}
