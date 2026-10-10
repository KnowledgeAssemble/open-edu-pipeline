import { createHash } from 'node:crypto';
import { slugify } from '../source-model/normalize.js';
import type { Chapter, ChapterStrategy } from './types.js';
import { detectTocPages, parsePageRange, parseTocEntries, splitPages } from './toc.js';

export interface SegmentChapterOptions {
  tocPages?: string;
  chapterHeading?: RegExp;
}

export interface ChapterSegmentation {
  chapters: Chapter[];
  strategy: ChapterStrategy;
}

interface Heading {
  level: number;
  title: string;
  lineIndex: number;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const PREFIX_HEADING_RE = /^(UNIT|CHAPTER|MODULE|LESSON)\s+\w+/i;
const ALL_CAPS_HEADING_RE = /^[A-Z][A-Z0-9 ,&'’.-]{6,}$/;
const TOC_HEADING_RE = /^#{1,6}\s*(contents|table of contents)\s*$/i;

const STOP_WORDS = new Set([
  'the',
  'and',
  'of',
  'a',
  'an',
  'to',
  'in',
  'for',
  'on',
  'with',
  'part',
]);

function findHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const lines = markdown.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = HEADING_RE.exec(lines[index] ?? '');
    if (!match) continue;
    headings.push({
      level: (match[1] ?? '#').length,
      title: (match[2] ?? '').trim(),
      lineIndex: index,
    });
  }
  return headings;
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token !== '' && !STOP_WORDS.has(token));
}

function concatNormalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Similarity of a TOC entry to a body heading, in [0, 1]. */
export function headingMatchScore(entry: string, heading: string): number {
  const entryTokens = tokens(entry);
  const headingTokens = new Set(tokens(heading));
  let tokenCoverage = 0;
  if (entryTokens.length > 0) {
    const hit = entryTokens.filter((token) => headingTokens.has(token)).length;
    tokenCoverage = hit / entryTokens.length;
  }

  const a = concatNormalized(entry);
  const b = concatNormalized(heading);
  let prefixRatio = 0;
  const shortest = Math.min(a.length, b.length);
  if (shortest > 0) {
    let common = 0;
    while (common < shortest && a[common] === b[common]) common += 1;
    prefixRatio = common / shortest;
  }

  return Math.max(tokenCoverage, prefixRatio);
}

/** Locate the TOC text: detected form-feed pages, else a contents heading. */
function findTocText(markdown: string, explicitRange: string | undefined): string | null {
  if (explicitRange) {
    const range = parsePageRange(explicitRange);
    if (range) {
      const pages = splitPages(markdown);
      const slice = pages.slice(range.start - 1, range.end);
      if (slice.length > 0) return slice.join('\n');
    }
  }

  const pages = splitPages(markdown);
  if (pages.length > 1) {
    const detected = detectTocPages(pages);
    if (detected.length > 0) {
      return detected.map((page) => pages[page - 1] ?? '').join('\n');
    }
  }

  const lines = markdown.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!TOC_HEADING_RE.test((lines[index] ?? '').trim())) continue;
    const startLevel = ((lines[index] ?? '').match(HEADING_RE)?.[1] ?? '#').length;
    const collected: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const match = HEADING_RE.exec(lines[cursor] ?? '');
      if (match && (match[1] ?? '#').length <= startLevel) break;
      collected.push(lines[cursor] ?? '');
    }
    if (collected.join('').trim() !== '') return collected.join('\n');
  }
  return null;
}

function pageIndexFor(markdown: string, charOffset: number): number {
  if (!markdown.includes('\f')) return -1;
  const before = markdown.slice(0, charOffset);
  return before.split(/\f/).length;
}

function buildChapter(
  title: string,
  markdown: string,
  startOffset: number,
  endOffset: number,
  id: string,
): Chapter {
  const body = markdown.slice(startOffset, endOffset).trim();
  const pageStart = pageIndexFor(markdown, startOffset);
  const pageEnd = pageIndexFor(markdown, Math.max(startOffset, endOffset - 1));
  const chapter: Chapter = {
    id,
    title,
    sha256: createHash('sha256').update(body).digest('hex'),
    markdown: body,
  };
  if (pageStart > 0) chapter.pageStart = pageStart;
  if (pageEnd > 0) chapter.pageEnd = pageEnd;
  return chapter;
}

function uniqueSlug(base: string, seen: Set<string>): string {
  let id = base || 'chapter';
  let suffix = 2;
  while (seen.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(id);
  return id;
}

function chapterOffsets(markdown: string, matched: Heading[]): Chapter[] {
  const chosen = [...matched].sort((a, b) => a.lineIndex - b.lineIndex);
  const seen = new Set<string>();
  const chapters: Chapter[] = [];

  for (let index = 0; index < chosen.length; index += 1) {
    const current = chosen[index];
    if (!current) continue;
    const next = chosen[index + 1];
    const lineOffsets = lineStartOffsets(markdown);
    const startOffset = lineOffsets[current.lineIndex] ?? 0;
    const endOffset = next ? (lineOffsets[next.lineIndex] ?? markdown.length) : markdown.length;
    const id = uniqueSlug(slugify(current.title), seen);
    chapters.push(buildChapter(current.title, markdown, startOffset, endOffset, id));
  }

  return chapters;
}

function lineStartOffsets(markdown: string): number[] {
  const offsets: number[] = [0];
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === '\n') offsets.push(index + 1);
  }
  return offsets;
}

function matchTocHeadings(headings: Heading[], tocText: string, tocStartOffset: number): Heading[] {
  const entries = parseTocEntries(tocText);
  const matched: Heading[] = [];
  const used = new Set<number>();

  for (const entry of entries) {
    let best: Heading | null = null;
    let bestScore = 0;
    for (const heading of headings) {
      if (heading.lineIndex < tocStartOffset) continue;
      if (used.has(heading.lineIndex)) continue;
      const score = headingMatchScore(entry, heading.title);
      if (score > bestScore) {
        bestScore = score;
        best = heading;
      }
    }
    if (best && bestScore >= 0.6) {
      used.add(best.lineIndex);
      matched.push(best);
    }
  }

  return matched;
}

/**
 * Deterministic chapter segmentation. Strategies are tried in order and the
 * first that yields two or more chapters wins; otherwise the whole document is a
 * single chapter so callers can reproduce the single-document layout.
 */
export function segmentChapters(
  markdown: string,
  opts: SegmentChapterOptions = {},
): ChapterSegmentation {
  const headings = findHeadings(markdown);

  const tocText = findTocText(markdown, opts.tocPages);
  if (tocText) {
    const tocHeading = headings.find((heading) => TOC_HEADING_RE.test(heading.title));
    const tocStart = tocHeading ? tocHeading.lineIndex : 0;
    const tocMatched = matchTocHeadings(headings, tocText, tocStart);
    if (tocMatched.length >= 2) {
      return { chapters: chapterOffsets(markdown, tocMatched), strategy: 'toc' };
    }
  }

  if (opts.chapterHeading) {
    const explicit = headings.filter((heading) => opts.chapterHeading?.test(heading.title));
    if (explicit.length >= 2) {
      return { chapters: chapterOffsets(markdown, explicit), strategy: 'explicit' };
    }
  }

  const patternMatched = headings.filter(
    (heading) => PREFIX_HEADING_RE.test(heading.title) || isAllCapsTitle(heading),
  );
  if (patternMatched.length >= 2) {
    return { chapters: chapterOffsets(markdown, patternMatched), strategy: 'heading' };
  }

  return { chapters: [singleChapter(markdown)], strategy: 'single' };
}

function isAllCapsTitle(heading: Heading): boolean {
  if (heading.level !== 1) return false;
  const title = heading.title;
  if (!ALL_CAPS_HEADING_RE.test(title)) return false;
  const letters = title.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  return letters === letters.toUpperCase();
}

function singleChapter(markdown: string): Chapter {
  const titleMatch = /^#\s+(.*)$/m.exec(markdown);
  const title = titleMatch?.[1]?.trim() || 'Document';
  const body = markdown.trim();
  return {
    id: slugify(title) || 'document',
    title,
    sha256: createHash('sha256').update(body).digest('hex'),
    markdown: body,
  };
}
