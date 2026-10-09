import type { SectionType, SourceDocumentModel, SourceSection } from './types.js';

export const SLUG_RE = /^(#{1,6})\s+(.*)$/;

export function sectionTypeFor(title: string): SectionType {
  const lower = title.toLowerCase();
  if (lower.includes('objective')) return 'objective';
  if (lower.includes('example')) return 'example';
  if (lower.includes('exercise')) return 'exercise';
  if (lower.includes("let's do and learn")) return 'activity';
  if (lower.includes('assessment') || lower.includes('test')) return 'assessment';
  if (lower.includes('note')) return 'note';
  return 'content';
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseMarkdown(markdown: string): SourceDocumentModel {
  const sections: SourceSection[] = [];
  let title = '';
  let current: SourceSection | null = null;

  for (const line of markdown.split('\n')) {
    const match = SLUG_RE.exec(line);
    if (match) {
      const headingLevel = match[1]?.length ?? 1;
      const headingText = (match[2] ?? '').trim();
      if (headingLevel === 1 && title === '') {
        title = headingText;
        continue;
      }
      if (current) sections.push(current);
      current = {
        id: slugify(headingText),
        type: sectionTypeFor(headingText),
        title: headingText,
        headingLevel,
        lines: [],
      };
      continue;
    }

    const trimmed = line.trim();
    if (trimmed !== '' && current) current.lines.push(trimmed);
  }

  if (current) sections.push(current);

  return { document: { id: '', title }, sections };
}
