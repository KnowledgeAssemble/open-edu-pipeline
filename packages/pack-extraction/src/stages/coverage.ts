import { slugify } from '../source-model/normalize.js';
import { normalizeWs, stripMarkdown } from './verify.js';

/** A heading-delimited block of chapter text. */
export interface SectionInfo {
  id: string;
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  parentId?: string;
  /** Numbered content sections ("1.1 …", "2.10 …") carry the teaching content. */
  teaching: boolean;
}

export interface CoverageReport {
  /** Learning objectives the chapter states in its source. */
  statedObjectives: number;
  /** Objectives the extraction actually produced. */
  extractedObjectives: number;
  /** Stated objectives the extraction missed. */
  objectiveGap: number;
  /** Numbered teaching sections in the chapter. */
  teachingSections: number;
  /** Teaching sections that at least one accepted concept comes from. */
  coveredSections: number;
  /** Teaching sections with no accepted concept. */
  uncoveredSections: string[];
  /** Teaching sections whose only concept attempt was rejected. */
  lostSections: string[];
  /** coveredSections / teachingSections (1 when the chapter has no teaching sections). */
  coverageRatio: number;
  /** Coverage below {@link LOW_COVERAGE_FLOOR}: the pack is materially incomplete. */
  lowCoverage: boolean;
}

/** Share of teaching sections that must carry a concept before a chapter counts as covered. */
export const LOW_COVERAGE_FLOOR = 0.5;

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const LIST_ITEM_RE = /^\s*(?:[-*+•]|\d+[.)])\s+/;
const ENUM_MARKER_RE = /^\s*(?:\([a-zivx]+\)|[a-z][.)]|\d+[.)])\s+/i;
const TEACHING_TITLE_RE = /^\d+(?:\.\d+)*\s+\S/;
const OBJECTIVE_HEADING_RE =
  /(we will learn|what you will learn|learning objective|learning outcome|course outcome)/i;

interface Heading {
  level: number;
  title: string;
  line: number;
}

/** Headings with their line numbers, in document order. */
function headings(markdown: string): Heading[] {
  const found: Heading[] = [];
  markdown.split('\n').forEach((line, index) => {
    const match = HEADING_RE.exec(line);
    if (match) found.push({ level: match[1]!.length, title: match[2]!.trim(), line: index });
  });
  return found;
}

/**
 * Heading-delimited blocks with their ancestry. A section runs until the next
 * heading of any level; `parentId` points at the enclosing section, so a fact in a
 * "Remember" box still belongs to the numbered section that contains it.
 */
export function parseSections(markdown: string): SectionInfo[] {
  const lines = markdown.split('\n');
  const found = headings(markdown);
  const sections: SectionInfo[] = [];

  if (found.length === 0 || found[0]!.line > 0) {
    sections.push({
      id: 'chapter-opening',
      title: '',
      level: 0,
      startLine: 0,
      endLine: found.length > 0 ? found[0]!.line : lines.length,
      teaching: false,
    });
  }

  const stack: SectionInfo[] = [];
  found.forEach((heading, index) => {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) stack.pop();
    const parent = stack[stack.length - 1];
    const section: SectionInfo = {
      id: slugify(heading.title) || `section-${index + 1}`,
      title: heading.title,
      level: heading.level,
      startLine: heading.line,
      endLine: index + 1 < found.length ? found[index + 1]!.line : lines.length,
      teaching: TEACHING_TITLE_RE.test(heading.title),
    };
    if (parent) section.parentId = parent.id;
    sections.push(section);
    stack.push(section);
  });

  return sections;
}

/** The numbered section a block belongs to, walking up through its ancestors. */
function teachingAncestor(
  sections: SectionInfo[],
  sectionId: string | undefined,
): SectionInfo | undefined {
  const byId = new Map(sections.map((section) => [section.id, section]));
  let current = sectionId ? byId.get(sectionId) : undefined;
  while (current) {
    if (current.teaching) return current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

/**
 * Learning objectives the chapter states in its source: every bullet under a
 * "We will learn …" / "Learning Objectives" heading, nested bullets included.
 *
 * Each objective block ends at the next heading of *any* level, so a chapter-level
 * "## Learning Objectives" heading does not swallow the bullets of every section
 * below it. Blocks are disjoint, so summing them counts a stated objective once
 * even when a nested "We will learn" heading sits inside the block.
 */
export function countStatedObjectives(markdown: string): number {
  const lines = markdown.split('\n');
  const found = headings(markdown);
  let total = 0;
  found.forEach((heading, index) => {
    if (!OBJECTIVE_HEADING_RE.test(heading.title)) return;
    const end = found[index + 1]?.line ?? lines.length;
    for (let line = heading.line + 1; line < end; line += 1) {
      if (LIST_ITEM_RE.test(lines[line] ?? '')) total += 1;
    }
  });
  return total;
}

/**
 * Line where an excerpt comes from. Falls back to the longest matching prefix so a
 * rejected excerpt (one the model rewrote) can still be attributed to a section.
 */
export function locateExcerpt(markdown: string, excerpt: string): number | undefined {
  const target = normalizeWs(stripMarkdown(excerpt));
  if (target === '') return undefined;
  const lines = markdown.split('\n');
  const prefixLengths = [target.length, 160, 120, 90, 60, 40];

  for (const length of prefixLengths) {
    if (length > target.length) continue;
    const needle = target.slice(0, length);
    let acc = '';
    for (let index = 0; index < lines.length; index += 1) {
      acc = `${acc} ${normalizeWs(stripMarkdown(lines[index] ?? ''))}`;
      if (acc.includes(needle)) return index;
    }
  }
  return undefined;
}

/**
 * List items an excerpt spans. A stated objective is often written as a parent
 * bullet with nested sub-bullets; a model that copies the whole block into one
 * excerpt therefore states several objectives in one. Splitting the excerpt back
 * into its list items keeps one objective per stated bullet.
 */
export function listItemsInRange(markdown: string, startLine: number, endLine: number): string[] {
  const lines = markdown.split('\n');
  const items: string[] = [];
  for (let line = startLine; line <= endLine && line < lines.length; line += 1) {
    const text = lines[line] ?? '';
    if (!LIST_ITEM_RE.test(text)) continue;
    const withoutMarker = text.replace(LIST_ITEM_RE, '').trim();
    const withoutEnum = withoutMarker.replace(ENUM_MARKER_RE, '').trim();
    if (withoutEnum !== '') items.push(withoutEnum);
  }
  return items;
}

/**
 * Line ranges an excerpt covers in the chapter source, one per occurrence.
 * Returns an empty array when the excerpt cannot be found (it was rejected as
 * ungrounded).
 */
export function excerptLineRanges(
  markdown: string,
  excerpt: string,
): Array<{ start: number; end: number }> {
  const target = normalizeWs(stripMarkdown(excerpt));
  if (target === '') return [];
  const lines = markdown.split('\n');
  const offsets: number[] = [];
  let cumulative = '';
  lines.forEach((line) => {
    if (cumulative !== '') cumulative += ' ';
    offsets.push(cumulative.length);
    cumulative += normalizeWs(stripMarkdown(line));
  });

  const ranges: Array<{ start: number; end: number }> = [];
  let from = 0;
  for (;;) {
    const found = cumulative.indexOf(target, from);
    if (found === -1) break;
    const last = found + target.length;
    let start = 0;
    let end = 0;
    offsets.forEach((offset, index) => {
      if (offset <= found) start = index;
      if (offset < last) end = index;
    });
    ranges.push({ start, end });
    from = found + 1;
  }
  return ranges;
}

/** First line range an excerpt covers; see {@link excerptLineRanges} for all of them. */
export function excerptLineRange(
  markdown: string,
  excerpt: string,
): { start: number; end: number } | undefined {
  return excerptLineRanges(markdown, excerpt)[0];
}

export interface CoverageInput {
  /** Chapter source text. */
  markdown: string;
  /** Excerpts of the concepts that were accepted. */
  acceptedExcerpts: string[];
  /** Excerpts of the concepts that were rejected (may be empty). */
  rejectedExcerpts: string[];
  /** Objectives the extraction produced. */
  extractedObjectives: number;
}

export interface SectionLocator {
  sections: SectionInfo[];
  /** Section the excerpt comes from, if any. */
  section(excerpt: string): SectionInfo | undefined;
  /** Numbered teaching section the excerpt belongs to, if any. */
  teachingSection(excerpt: string): SectionInfo | undefined;
}

/** Section lookups for one chapter, parsed once. */
export function createSectionLocator(markdown: string): SectionLocator {
  const sections = parseSections(markdown);

  const owner = (excerpt: string): SectionInfo | undefined => {
    const line = locateExcerpt(markdown, excerpt);
    if (line === undefined) return undefined;
    return [...sections]
      .reverse()
      .find((section) => section.startLine <= line && line < section.endLine);
  };

  const teaching = (excerpt: string): SectionInfo | undefined =>
    teachingAncestor(sections, owner(excerpt)?.id);

  return { sections, section: owner, teachingSection: teaching };
}

/**
 * How much of the chapter's teaching content the extraction actually captured.
 * Precision is enforced by the grounding verifier; this measures the other side —
 * recall — so a chapter that states six objectives and yields three, or that loses a
 * whole section to a rejected excerpt, cannot pass as healthy.
 */
export function chapterCoverage(input: CoverageInput): CoverageReport {
  const locator = createSectionLocator(input.markdown);
  const teaching = locator.sections.filter((section) => section.teaching);
  const covered = new Set<string>();

  for (const excerpt of input.acceptedExcerpts) {
    const ancestor = locator.teachingSection(excerpt);
    if (ancestor) covered.add(ancestor.id);
  }

  const lost = new Set<string>();
  for (const excerpt of input.rejectedExcerpts) {
    const ancestor = locator.teachingSection(excerpt);
    if (!ancestor || covered.has(ancestor.id)) continue;
    lost.add(ancestor.id);
  }

  const uncovered = teaching
    .filter((section) => !covered.has(section.id))
    .map((section) => section.title);
  const statedObjectives = countStatedObjectives(input.markdown);
  const teachingSections = teaching.length;
  const coveredSections = covered.size;

  return {
    statedObjectives,
    extractedObjectives: input.extractedObjectives,
    objectiveGap: Math.max(0, statedObjectives - input.extractedObjectives),
    teachingSections,
    coveredSections,
    uncoveredSections: uncovered,
    lostSections: [...lost].map((id) => locator.sections.find((s) => s.id === id)?.title ?? id),
    coverageRatio: teachingSections === 0 ? 1 : coveredSections / teachingSections,
    lowCoverage: teachingSections > 0 && coveredSections / teachingSections < LOW_COVERAGE_FLOOR,
  };
}
