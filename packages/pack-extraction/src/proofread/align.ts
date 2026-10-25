import type { Confidence, PageMap, PageMapEntry, PageReference, ReferenceBundle } from './types.js';
import { sha256 } from './util.js';

interface Block {
  first: string;
  last: string;
}

interface AnchorMatch {
  index: number;
  confidence: Confidence;
}

const FUZZY_MIN = 0.72;

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/** Split page Markdown into blank-line-separated blocks, keeping first/last line. */
function blocksOf(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  let current: string[] = [];
  const flush = (): void => {
    const nonEmpty = current.map(normalizeLine).filter((line) => line !== '');
    if (nonEmpty.length > 0) {
      blocks.push({ first: nonEmpty[0] ?? '', last: nonEmpty[nonEmpty.length - 1] ?? '' });
    }
    current = [];
  };
  for (const line of lines) {
    if (line.trim() === '') flush();
    else current.push(line);
  }
  flush();
  return blocks.filter((block) => block.first !== '');
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter((token) => token !== ''),
  );
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function findAnchor(
  normalizedLines: string[],
  normalizedLowerLines: string[],
  anchor: string,
  minIndex: number,
): AnchorMatch | undefined {
  const target = normalizeLine(anchor);
  if (target === '') return undefined;
  const lowerTarget = target.toLowerCase();

  const exact: number[] = [];
  for (let index = minIndex; index < normalizedLines.length; index += 1) {
    if (normalizedLines[index] === target) exact.push(index);
  }
  if (exact.length > 0) {
    const index = exact[0] ?? minIndex;
    return { index, confidence: exact.length === 1 ? 'high' : 'medium' };
  }

  let best: { index: number; score: number } | undefined;
  for (let index = minIndex; index < normalizedLowerLines.length; index += 1) {
    const candidate = normalizedLowerLines[index] ?? '';
    if (candidate === '') continue;
    const score = similarity(lowerTarget, candidate);
    if (score >= FUZZY_MIN && (best === undefined || score > best.score)) {
      best = { index, score };
    }
  }
  if (best === undefined) return undefined;
  return { index: best.index, confidence: best.score >= 0.9 ? 'medium' : 'low' };
}

function lowestConfidence(...values: Confidence[]): Confidence {
  if (values.includes('low')) return 'low';
  if (values.includes('medium')) return 'medium';
  return 'high';
}

export interface AlignOptions {
  rawMarkdown: string;
  reference: ReferenceBundle;
}

export interface AlignResult {
  pageMap: PageMap;
  /** Page numbers that could not be aligned at all. */
  unaligned: number[];
}

/**
 * Align raw LitParse Markdown to reference pages using the first/last non-empty
 * block on each page. Ranges are monotonic and never overlap.
 */
export function alignPages(options: AlignOptions): AlignResult {
  const rawLines = options.rawMarkdown.split(/\r?\n/);
  const normalized = rawLines.map(normalizeLine);
  const lower = normalized.map((line) => line.toLowerCase());
  const entries: PageMapEntry[] = [];
  const unaligned: number[] = [];
  let cursor = 0;

  for (const page of options.reference.pages) {
    const blocks = blocksOf(page.pageMarkdown || page.text);
    if (blocks.length === 0) {
      const line = Math.min(Math.max(cursor + 1, 1), Math.max(rawLines.length, 1));
      entries.push({
        pageNum: page.pageNum,
        startLine: line,
        endLine: line,
        confidence: 'high',
        method: 'empty-page',
        referenceKind: page.kind,
      });
      cursor = line;
      continue;
    }

    const firstBlock = blocks[0] ?? { first: '', last: '' };
    const lastBlock = blocks[blocks.length - 1] ?? firstBlock;
    const start = findAnchor(normalized, lower, firstBlock.first, cursor);
    if (start === undefined) {
      unaligned.push(page.pageNum);
      continue;
    }
    const end = findAnchor(normalized, lower, lastBlock.last, start.index);
    if (end === undefined || end.index < start.index) {
      unaligned.push(page.pageNum);
      continue;
    }

    const confidence = lowestConfidence(start.confidence, end.confidence);
    const method =
      start.confidence === 'high' && end.confidence === 'high'
        ? 'exact-anchor'
        : start.confidence === 'low' || end.confidence === 'low'
          ? 'token-diff'
          : 'normalized-anchor';
    entries.push({
      pageNum: page.pageNum,
      startLine: start.index + 1,
      endLine: end.index + 1,
      confidence,
      method,
      referenceKind: page.kind,
    });
    cursor = end.index + 1;
  }

  const pageMap: PageMap = {
    available: options.reference.available,
    pdfSha256: options.reference.manifest.pdfSha256,
    rawMarkdownSha256: sha256(options.rawMarkdown),
    liteparseVersion: options.reference.manifest.liteparseVersion,
    pages: entries,
    unaligned,
    markerSkipped: [],
  };
  return { pageMap, unaligned };
}

/** No-PDF mode: an explicit unavailable page map with no pages or markers. */
export function unavailablePageMap(rawMarkdown: string): PageMap {
  return {
    available: false,
    pdfSha256: '',
    rawMarkdownSha256: sha256(rawMarkdown),
    liteparseVersion: 'unknown',
    pages: [],
    unaligned: [],
    markerSkipped: [],
  };
}

export interface PilotGateResult {
  totalPages: number;
  alignedPages: number;
  highPages: number;
  highOrMediumRatio: number;
  highRatio: number;
  ok: boolean;
}

/** Pilot gate from the design: >=95% high/medium and >=90% high. */
export function pilotGate(pageMap: PageMap): PilotGateResult {
  const totalPages = pageMap.pages.length + pageMap.unaligned.length;
  const alignedPages = pageMap.pages.length;
  const highPages = pageMap.pages.filter((page) => page.confidence === 'high').length;
  const highOrMediumPages = pageMap.pages.filter(
    (page) => page.confidence === 'high' || page.confidence === 'medium',
  ).length;
  const highOrMediumRatio = totalPages === 0 ? 1 : highOrMediumPages / totalPages;
  const highRatio = totalPages === 0 ? 1 : highPages / totalPages;
  return {
    totalPages,
    alignedPages,
    highPages,
    highOrMediumRatio,
    highRatio,
    ok: highOrMediumRatio >= 0.95 && highRatio >= 0.9,
  };
}

export function pageAtLine(pageMap: PageMap, line: number): PageMapEntry[] {
  return pageMap.pages.filter((page) => line >= page.startLine && line <= page.endLine);
}

export function pageForLine(pageMap: PageMap, line: number): PageMapEntry | undefined {
  return pageAtLine(pageMap, line)[0];
}

export function pageForReference(
  pages: PageReference[],
  pageNum: number,
): PageReference | undefined {
  return pages.find((page) => page.pageNum === pageNum);
}
