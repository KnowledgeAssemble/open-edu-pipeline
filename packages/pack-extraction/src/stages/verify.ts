import type { Chapter } from '../chapters/types.js';
import { slugify } from '../source-model/normalize.js';
import type { ChapterExtraction } from './extract.js';

export type RejectReason = 'schema' | 'excerpt-not-found';

export interface Rejection {
  item: string;
  reason: RejectReason;
  excerpt?: string;
}

export interface VerifiedConcept {
  id: string;
  term: string;
  title: string;
  summary: string;
  excerpt: string;
  chapterId: string;
  page?: number;
  origin: 'source' | 'derived';
}

export interface VerifiedObjective {
  id: string;
  statement: string;
  excerpt: string;
  chapterId: string;
  concepts: string[];
}

export interface VerifyChapterResult {
  concepts: VerifiedConcept[];
  objectives: VerifiedObjective[];
  rejections: Rejection[];
  totalItems: number;
  healthy: boolean;
}

export interface VerifyOptions {
  documentId: string;
  usedConceptIds: Set<string>;
}

export function normalizeWs(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function stripMarkdown(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => line.replace(/^\s*#{1,6}\s*/, '').replace(/[*_`|]/g, ''))
    .join('\n');
}

/** Accept an excerpt when it is a whitespace-normalized substring of either the
 * raw chapter markdown or its markdown-stripped variant. */
export function isGrounded(excerpt: string, markdown: string): boolean {
  const target = normalizeWs(excerpt);
  if (target === '') return false;
  return (
    normalizeWs(markdown).includes(target) || normalizeWs(stripMarkdown(markdown)).includes(target)
  );
}

export function pageForExcerpt(
  markdown: string,
  excerpt: string,
  pageBase = 0,
): number | undefined {
  if (!markdown.includes('\f')) return undefined;
  const pages = markdown.split(/\f/);
  const target = normalizeWs(excerpt);
  if (target === '') return undefined;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] ?? '';
    if (normalizeWs(page).includes(target) || normalizeWs(stripMarkdown(page)).includes(target)) {
      return pageBase + index + 1;
    }
  }
  return undefined;
}

/**
 * Deterministic trust boundary: zod-parse (done upstream), excerpt grounding,
 * id assignment (bare id to first book-order occurrence, temp id for later
 * duplicates), and provenance. Also assembles same-chapter objective links.
 */
export function verifyExtraction(
  chapter: Chapter,
  extraction: ChapterExtraction,
  options: VerifyOptions,
): VerifyChapterResult {
  const rejections: Rejection[] = [];
  const concepts: VerifiedConcept[] = [];
  const objectives: VerifiedObjective[] = [];
  const pageBase = (chapter.pageStart ?? 1) - 1;
  let totalItems = 0;

  for (const item of extraction.concepts) {
    totalItems += 1;
    const term = item.term.trim();
    const summary = item.summary.trim();
    const excerpt = item.excerpt.trim();
    const slug = slugify(term);
    if (term === '' || summary === '' || excerpt === '' || slug === '') {
      rejections.push({ item: term || 'concept', reason: 'schema' });
      continue;
    }
    if (!isGrounded(excerpt, chapter.markdown)) {
      rejections.push({ item: term, reason: 'excerpt-not-found', excerpt });
      continue;
    }

    let id: string;
    if (!options.usedConceptIds.has(slug)) {
      id = slug;
    } else {
      id = `${chapter.id}--${slug}`;
      let suffix = 2;
      while (options.usedConceptIds.has(id)) {
        id = `${chapter.id}--${slug}-${suffix}`;
        suffix += 1;
      }
    }
    options.usedConceptIds.add(id);

    const concept: VerifiedConcept = {
      id,
      term,
      title: term,
      summary: summary.slice(0, 1999),
      excerpt,
      chapterId: chapter.id,
      origin: 'derived',
    };
    const page = pageForExcerpt(chapter.markdown, excerpt, pageBase);
    if (page !== undefined && page > 0) concept.page = page;
    concepts.push(concept);
  }

  const chapterConceptIds = concepts.map((concept) => concept.id);
  const seenObjectiveIds = new Set<string>();
  for (const item of extraction.objectives) {
    totalItems += 1;
    const statement = item.statement.trim();
    const excerpt = item.excerpt.trim();
    if (statement === '' || excerpt === '') {
      rejections.push({ item: statement || 'objective', reason: 'schema' });
      continue;
    }
    if (!isGrounded(excerpt, chapter.markdown)) {
      rejections.push({ item: statement, reason: 'excerpt-not-found', excerpt });
      continue;
    }

    const base = slugify(statement) || 'objective';
    let id = base;
    let suffix = 2;
    while (seenObjectiveIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    seenObjectiveIds.add(id);

    objectives.push({
      id,
      statement: statement.slice(0, 500),
      excerpt,
      chapterId: chapter.id,
      concepts: chapterConceptIds,
    });
  }

  const rejectedRatio = totalItems === 0 ? 1 : rejections.length / totalItems;
  const healthy = objectives.length >= 1 && rejectedRatio < 0.3;

  return { concepts, objectives, rejections, totalItems, healthy };
}
