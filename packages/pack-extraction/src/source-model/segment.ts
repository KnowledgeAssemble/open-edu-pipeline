import type { SourceDocumentModel } from './types.js';
import { parseMarkdown, matchesLessonHeading } from './normalize.js';
import type { LessonHeadingMatcher } from './normalize.js';

export type { LessonHeadingMatcher } from './normalize.js';
export { DEFAULT_LESSON_HEADING_RE, matchesLessonHeading } from './normalize.js';

export interface SegmentOptions {
  lessonHeading?: LessonHeadingMatcher;
}

export interface LessonDoc {
  doc: SourceDocumentModel;
  title: string;
  markdown: string;
}

const H1_RE = /^#\s+(.*)$/;

/**
 * Split a markdown document into lesson documents at H1 headings that look like
 * lesson titles. Returns an empty array when no lesson heading is found, so
 * callers can fall back to single-document behavior.
 */
export function segmentMarkdown(markdown: string, opts?: SegmentOptions): LessonDoc[] {
  const matcher = opts?.lessonHeading;
  const lines = markdown.split('\n');
  const boundaries: { index: number; title: string }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = H1_RE.exec(lines[index] ?? '');
    if (!match) continue;
    const headingText = (match[1] ?? '').trim();
    if (matchesLessonHeading(headingText, matcher)) {
      boundaries.push({ index, title: headingText });
    }
  }

  if (boundaries.length === 0) return [];

  const lessons: LessonDoc[] = [];
  for (let boundary = 0; boundary < boundaries.length; boundary += 1) {
    const start = boundaries[boundary]?.index ?? 0;
    const end = boundaries[boundary + 1]?.index ?? lines.length;
    const chunk = lines.slice(start, end).join('\n').trim();
    if (chunk === '') continue;
    const doc = parseMarkdown(chunk);
    const title = doc.document.title || boundaries[boundary]?.title || 'Lesson';
    lessons.push({ doc, title, markdown: chunk });
  }

  return lessons;
}
