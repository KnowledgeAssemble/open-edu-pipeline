import type { SectionType, SourceDocumentModel, SourceSection } from './types.js';

export const SLUG_RE = /^(#{1,6})\s+(.*)$/;

export type LessonHeadingMatcher = RegExp | string[] | ((title: string) => boolean);

export interface ParseMarkdownOptions {
  /**
   * When provided, an H1 that matches this matcher is treated as a lesson heading
   * (kept as a section) rather than consumed as the document title.
   */
  lessonHeading?: LessonHeadingMatcher;
}

export const DEFAULT_LESSON_HEADING_RE = /^[A-Z][A-Z\s0-9(),.&'/-]{3,}$/;

export function matchesLessonHeading(title: string, matcher?: LessonHeadingMatcher): boolean {
  const text = title.trim();
  const candidate = matcher ?? DEFAULT_LESSON_HEADING_RE;
  if (typeof candidate === 'function') return candidate(text);
  if (candidate instanceof RegExp) return candidate.test(text);
  return candidate.some((label) => label.toLowerCase() === text.toLowerCase());
}

export function sectionTypeFor(title: string): SectionType {
  const lower = title.toLowerCase();
  if (
    lower.includes('objective') ||
    lower.includes('we will learn') ||
    lower.includes('you will learn') ||
    lower.includes('learning outcome')
  ) {
    return 'objective';
  }
  if (lower.includes('example')) return 'example';
  if (
    lower.includes('exercise') ||
    lower.includes('practice') ||
    lower.includes('what you have learnt')
  ) {
    return 'exercise';
  }
  if (lower.includes("let's do") || lower.includes('lets do') || lower.includes('activity')) {
    return 'activity';
  }
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

export function parseMarkdown(markdown: string, opts?: ParseMarkdownOptions): SourceDocumentModel {
  const sections: SourceSection[] = [];
  let title = '';
  let current: SourceSection | null = null;

  for (const line of markdown.split('\n')) {
    const match = SLUG_RE.exec(line);
    if (match) {
      const headingLevel = match[1]?.length ?? 1;
      const headingText = (match[2] ?? '').trim();
      const isLessonHeading =
        headingLevel === 1 &&
        opts?.lessonHeading !== undefined &&
        matchesLessonHeading(headingText, opts.lessonHeading);
      if (headingLevel === 1 && title === '' && !isLessonHeading) {
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
