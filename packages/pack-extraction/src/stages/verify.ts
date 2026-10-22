import type { z } from 'zod';
import type { Chapter } from '../chapters/types.js';
import { slugify } from '../source-model/normalize.js';
import type { ChapterExtractionSchema } from './extract.js';
import {
  chapterCoverage,
  createSectionLocator,
  excerptLineRanges,
  listItemsInRange,
  type CoverageReport,
  type SectionLocator,
} from './coverage.js';

export type RejectReason = 'schema' | 'excerpt-not-found';

/** Extraction as it arrives from the model: `conceptTerms` may be absent. */
export type ChapterExtractionInput = z.input<typeof ChapterExtractionSchema>;

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
  /** How much of the chapter's teaching content the extraction captured. */
  coverage: CoverageReport;
  /** Human-readable reasons the chapter is not healthy, fed to the escalation prompt. */
  failures: string[];
}

export interface VerifyOptions {
  usedConceptIds: Set<string>;
  /**
   * Apply the recall gates (objective gap, lost sections, coverage floor). They
   * measure what an LLM extraction missed; the deterministic extractor is not
   * expected to cover the chapter's sections, so its attempts opt out and keep
   * the precision gates only. Defaults to `true`.
   */
  enforceCoverage?: boolean;
}

/** Max id length allowed by the pack schemas (`ConceptSchema`); objectives/units share it. */
export const MAX_ID_LENGTH = 128;

/** Room reserved for a `-N` dedup suffix so a capped base can never overflow. */
const ID_SUFFIX_BUDGET = 12;

/** Clamp a slug to the pack id limit, trimming any separator left by the cut. */
export function cappedId(value: string, max = MAX_ID_LENGTH): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max).replace(/[-_]+$/, '');
  return cut === '' ? value.slice(0, max) : cut;
}

export function normalizeWs(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const LIST_MARKER_RE = /^\s*(?:[-*+•]|\d+[.)])\s+/;
const SEPARATOR_LINE_RE = /^[\s:._-]*$/;

/** Strip markdown structure — headings, emphasis, table pipes, list/bullet markers,
 *  LaTeX math delimiters, and separator rows — so formatting differences do not
 *  break verbatim matching. */
export function stripMarkdown(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(LIST_MARKER_RE, '')
        .replace(/[*_`|•$]/g, ''),
    )
    .filter((line) => !SEPARATOR_LINE_RE.test(line))
    .join('\n');
}

/** Accept an excerpt when it is a whitespace-normalized substring of the raw chapter
 * markdown or its markdown-stripped variant. Both sides are normalized so list/bullet
 * markers, table pipes, and line breaks don't cause false negatives. */
export function isGrounded(excerpt: string, markdown: string): boolean {
  const target = normalizeWs(stripMarkdown(excerpt));
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
  const target = normalizeWs(stripMarkdown(excerpt));
  if (target === '') return undefined;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] ?? '';
    if (normalizeWs(page).includes(target) || normalizeWs(stripMarkdown(page)).includes(target)) {
      return pageBase + index + 1;
    }
  }
  return undefined;
}

/** Words that carry no concept signal in a learning objective. */
const STOPWORDS = new Set(
  `let us we our you your and or of the in to for with about from them they are is be will shall can could may now also then so if but when what how all any some more most that this these those it its as at by on upto do does did such via their there here than into over under between each other others same new own only very just both not no nor learn learnt learning learned read reads reading write writes writing written understand understands understanding knowledge know knows study studies form forms forming place value values digit digits number numbers`.split(
    /\s+/,
  ),
);

/** Content words of a term or statement, stopwords removed. */
function significantWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (word) => word.length > 2 && !STOPWORDS.has(word),
  );
}

/** Normalized form used to match a model-supplied term to a concept title. */
function matchKey(value: string): string {
  return normalizeWs(value).toLowerCase();
}

/**
 * Resolve the concept terms the model attached to an objective to concept ids.
 * Only terms that match an extracted concept count; anything else is ignored.
 */
export function resolveConceptTerms(terms: string[], concepts: VerifiedConcept[]): string[] {
  const resolved: string[] = [];
  for (const term of terms) {
    const key = matchKey(term);
    if (key === '') continue;
    const exact = concepts.find((concept) => matchKey(concept.title) === key);
    if (exact) {
      resolved.push(exact.id);
      continue;
    }
    const partial = concepts.find(
      (concept) => matchKey(concept.title).includes(key) || key.includes(matchKey(concept.title)),
    );
    if (partial) resolved.push(partial.id);
  }
  return [...new Set(resolved)];
}

/**
 * Concepts whose title shares a distinctive word with the objective statement.
 * Words that appear in many concept titles of the chapter carry no signal and
 * are ignored, so an objective is not linked to every concept of the chapter.
 */
export function lexicalConceptMatches(statement: string, concepts: VerifiedConcept[]): string[] {
  if (concepts.length === 0) return [];
  const titleWords = concepts.map((concept) => significantWords(concept.title));
  const frequency = new Map<string, number>();
  for (const words of titleWords) {
    for (const word of new Set(words)) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }
  const common = Math.max(2, Math.floor(concepts.length * 0.4));
  const statementWords = new Set(significantWords(statement));
  return concepts
    .filter((_, index) => {
      const words = titleWords[index] ?? [];
      return words.some((word) => statementWords.has(word) && (frequency.get(word) ?? 0) <= common);
    })
    .map((concept) => concept.id);
}

/**
 * Concepts an objective is linked to. The model's own mapping wins; when it names
 * nothing usable, the concepts of the same teaching section are used, and finally a
 * distinctive-word match. An objective is never linked to every concept of the
 * chapter just because they share a chapter.
 */
function linkConcepts(input: {
  statement: string;
  excerpt: string;
  termIds: string[];
  concepts: VerifiedConcept[];
  conceptSections: Map<string, string | undefined>;
  locator: SectionLocator;
}): string[] {
  if (input.termIds.length > 0) return input.termIds;

  const section = input.locator.teachingSection(input.excerpt)?.id;
  if (section) {
    const sameSection = input.concepts
      .filter((concept) => input.conceptSections.get(concept.id) === section)
      .map((concept) => concept.id);
    if (sameSection.length > 0) return sameSection;
  }

  return lexicalConceptMatches(input.statement, input.concepts);
}

/**
 * Stated objectives an excerpt covers. A chapter states its objectives as bullets,
 * often a parent bullet with nested sub-bullets; a model that copies the whole
 * block into one excerpt states several objectives in one. Splitting the excerpt
 * back into its list items keeps one objective per stated bullet, whatever the
 * model did.
 *
 * The excerpt can occur more than once in the chapter (an objective bullet that the
 * body repeats). The occurrence spanning the most list items is the objective
 * block, not the sentence quoted in the prose.
 */
function objectiveParts(markdown: string, excerpt: string): string[] {
  let best: string[] = [];
  for (const range of excerptLineRanges(markdown, excerpt)) {
    const items = listItemsInRange(markdown, range.start, range.end);
    if (items.length > best.length) best = items;
  }
  return best.length > 1 ? best : [];
}

/**
 * Function words that carry no concept signal when matching a concept title to an
 * objective bullet. Unlike {@link STOPWORDS} it keeps content words such as
 * "place", "value" and "digit", which are exactly what split objectives differ on.
 */
const DISTRIBUTION_STOPWORDS = new Set(
  'the and for with from that this these those of in to a an as at by on or into over under'.split(
    ' ',
  ),
);

/** Content words used to match a concept title to an objective bullet. */
function distributionWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (word) => word.length > 2 && !DISTRIBUTION_STOPWORDS.has(word),
  );
}

/**
 * Spread the model's concept mapping over the objectives a split excerpt stands
 * for: each concept goes to the bullet that names it (the title appears verbatim),
 * else the bullet that shares the most content words with its title.
 */
function distributeTermIds(
  parts: string[],
  termIds: string[],
  concepts: VerifiedConcept[],
): string[][] {
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  const partKeys = parts.map((part) => normalizeWs(part).toLowerCase());
  const partWords = parts.map((part) => new Set(distributionWords(part)));
  const distributed = parts.map(() => [] as string[]);
  for (const id of termIds) {
    const concept = byId.get(id);
    if (!concept) continue;
    const titleKey = normalizeWs(concept.title).toLowerCase();
    const titleWords = distributionWords(concept.title);
    let best = 0;
    let bestScore = -1;
    parts.forEach((_, index) => {
      let score = 0;
      if (titleKey !== '' && partKeys[index]!.includes(titleKey)) score += 10;
      for (const word of titleWords) if (partWords[index]!.has(word)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    distributed[best]!.push(id);
  }
  return distributed;
}

/**
 * Deterministic trust boundary: zod-parse (done upstream), excerpt grounding,
 * id assignment (bare id to first book-order occurrence, temp id for later
 * duplicates), and provenance. Also assembles the objective→concept links and
 * measures how much of the chapter the extraction actually covered.
 */
export function verifyExtraction(
  chapter: Chapter,
  extraction: ChapterExtractionInput,
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
    const slug = cappedId(slugify(term));
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
      const base = cappedId(`${chapter.id}--${slug}`, MAX_ID_LENGTH - ID_SUFFIX_BUDGET);
      id = base;
      let suffix = 2;
      while (options.usedConceptIds.has(id)) {
        id = `${base}-${suffix}`;
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

  const locator = createSectionLocator(chapter.markdown);
  const conceptSections = new Map<string, string | undefined>(
    concepts.map((concept) => [concept.id, locator.teachingSection(concept.excerpt)?.id]),
  );
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

    const parts = objectiveParts(chapter.markdown, excerpt);
    const termIds = resolveConceptTerms(item.conceptTerms ?? [], concepts);
    const entries =
      parts.length > 0
        ? parts.map((text) => ({ statement: text, excerpt: text }))
        : [{ statement, excerpt }];
    const termIdsPerPart =
      parts.length > 0 ? distributeTermIds(parts, termIds, concepts) : [termIds];

    entries.forEach((entry, partIndex) => {
      const partStatement = entry.statement;
      const partExcerpt = entry.excerpt;

      const base = cappedId(
        slugify(partStatement) || 'objective',
        MAX_ID_LENGTH - ID_SUFFIX_BUDGET,
      );
      let id = base;
      let suffix = 2;
      while (seenObjectiveIds.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
      seenObjectiveIds.add(id);

      objectives.push({
        id,
        statement: partStatement.slice(0, 500),
        excerpt: partExcerpt,
        chapterId: chapter.id,
        concepts: linkConcepts({
          statement: partStatement,
          excerpt: partExcerpt,
          termIds: termIdsPerPart[partIndex] ?? [],
          concepts,
          conceptSections,
          locator,
        }),
      });
    });
  }

  const coverage = chapterCoverage({
    markdown: chapter.markdown,
    acceptedExcerpts: concepts.map((concept) => concept.excerpt),
    rejectedExcerpts: rejections
      .filter((rejection) => rejection.reason === 'excerpt-not-found' && rejection.excerpt)
      .map((rejection) => rejection.excerpt as string),
    extractedObjectives: objectives.length,
  });

  const enforceCoverage = options.enforceCoverage ?? true;
  const rejectedRatio = totalItems === 0 ? 1 : rejections.length / totalItems;
  const failures: string[] = [];
  if (objectives.length < 1)
    failures.push('objective-gap: no grounded learning objective was extracted');
  if (enforceCoverage && coverage.objectiveGap > 0) {
    failures.push(
      `objective-gap: the chapter states ${coverage.statedObjectives} learning objectives but only ${coverage.extractedObjectives} were extracted — emit one objective for every stated objective bullet, nested bullets included`,
    );
  }
  if (enforceCoverage) {
    const lost = new Set(coverage.lostSections);
    for (const title of coverage.lostSections) {
      failures.push(
        `uncovered-section: "${title}" — its only concept was rejected; extract a concept from this section`,
      );
    }
    for (const title of coverage.uncoveredSections) {
      if (lost.has(title)) continue;
      failures.push(
        `uncovered-section: "${title}" — extract at least one concept from this section`,
      );
    }
  }
  if (rejectedRatio >= 0.3) {
    failures.push(
      `rejection-rate: ${Math.round(rejectedRatio * 100)}% of the extracted items were rejected`,
    );
  }

  const coverageHealthy =
    !enforceCoverage ||
    (coverage.objectiveGap === 0 && coverage.lostSections.length === 0 && !coverage.lowCoverage);
  const healthy = objectives.length >= 1 && rejectedRatio < 0.3 && coverageHealthy;

  return { concepts, objectives, rejections, totalItems, healthy, coverage, failures };
}
