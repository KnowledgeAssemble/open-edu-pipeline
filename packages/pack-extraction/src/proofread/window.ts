import type { DeterministicFinding, PageMap, PageReference, PageWindow } from './types.js';
import { LARGE_PAGE_CHARS } from './types.js';

export interface BuildWindowsOptions {
  rawMarkdown: string;
  referencePages: PageReference[];
  pageMap: PageMap;
  windowSize?: number;
  largePageChars?: number;
  deterministicFindings?: DeterministicFinding[];
}

export interface BuildWindowsResult {
  windows: PageWindow[];
  /** Pages aligned and placed in a review window. */
  scopedPages: number[];
  /** Content pages that could not be aligned to the Markdown. */
  unscopedContentPages: number[];
  /** Page numbers whose large page could not be split safely. */
  oversizedPages: number[];
}

function sliceLines(lines: string[], startLine: number, endLine: number): string {
  return lines.slice(startLine - 1, endLine).join('\n');
}

function isBoundary(line: string): boolean {
  if (line.trim() === '') return true;
  return /^(#{1,6}\s|```|~~~|\s*([-*+]|\d+\.)\s|\s*\|)/.test(line);
}

/** Split a Markdown slice at block boundaries without breaking a block silently. */
export function splitMarkdownByBoundaries(
  markdown: string,
  startLine: number,
  maxChars: number,
): Array<{ markdown: string; startLine: number; endLine: number; oversized: boolean }> {
  const lines = markdown.split('\n');
  if (markdown.length <= maxChars) {
    return [{ markdown, startLine, endLine: startLine + lines.length - 1, oversized: false }];
  }
  const chunks: Array<{
    markdown: string;
    startLine: number;
    endLine: number;
    oversized: boolean;
  }> = [];
  let current: string[] = [];
  let currentStart = startLine;
  const flush = (): void => {
    if (current.length === 0) return;
    const text = current.join('\n');
    chunks.push({
      markdown: text,
      startLine: currentStart,
      endLine: currentStart + current.length - 1,
      oversized: text.length > maxChars,
    });
    current = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (current.length > 0 && current.join('\n').length + line.length + 1 > maxChars) {
      if (isBoundary(line) || current.join('\n').length >= maxChars) flush();
    }
    if (current.length === 0) currentStart = startLine + index;
    current.push(line);
  }
  flush();
  return chunks;
}

function contextPagesFor(referencePages: PageReference[], index: number): PageReference[] {
  const context: PageReference[] = [];
  const previous = referencePages[index - 1];
  const next = referencePages[index + 1];
  if (previous) context.push(previous);
  if (next) context.push(next);
  return context;
}

export function buildWindows(options: BuildWindowsOptions): BuildWindowsResult {
  const windowSize = Math.max(1, options.windowSize ?? 2);
  const largePageChars = options.largePageChars ?? LARGE_PAGE_CHARS;
  const rawLines = options.rawMarkdown.split(/\r?\n/);
  const entryByPage = new Map(options.pageMap.pages.map((entry) => [entry.pageNum, entry]));
  const windows: PageWindow[] = [];
  const scopedPages: number[] = [];
  const unscopedContentPages: number[] = [];
  const oversizedPages: number[] = [];

  const aligned: Array<{ page: PageReference; index: number }> = [];
  for (let index = 0; index < options.referencePages.length; index += 1) {
    const page = options.referencePages[index];
    if (!page) continue;
    if (entryByPage.has(page.pageNum)) aligned.push({ page, index });
    else if (page.text.trim() !== '' || page.pageMarkdown.trim() !== '') {
      unscopedContentPages.push(page.pageNum);
    }
  }

  let cursor = 0;
  while (cursor < aligned.length) {
    const current = aligned[cursor];
    if (!current) break;
    if (current.page.kind === 'vision') {
      const entry = entryByPage.get(current.page.pageNum);
      if (entry) {
        windows.push({
          pageNums: [current.page.pageNum],
          kind: 'vision',
          pages: [current.page],
          contextPages: contextPagesFor(options.referencePages, current.index),
          markdown: sliceLines(rawLines, entry.startLine, entry.endLine),
          startLine: entry.startLine,
          endLine: entry.endLine,
        });
        scopedPages.push(current.page.pageNum);
      }
      cursor += 1;
      continue;
    }

    const group: Array<{ page: PageReference; index: number }> = [];
    while (
      cursor < aligned.length &&
      group.length < windowSize &&
      aligned[cursor]?.page.kind === 'text'
    ) {
      const candidate = aligned[cursor];
      if (!candidate) break;
      group.push(candidate);
      cursor += 1;
    }
    if (group.length === 0) {
      cursor += 1;
      continue;
    }
    const startEntry = entryByPage.get(group[0]?.page.pageNum ?? 0);
    const endEntry = entryByPage.get(group[group.length - 1]?.page.pageNum ?? 0);
    if (!startEntry || !endEntry) continue;
    const markdown = sliceLines(rawLines, startEntry.startLine, endEntry.endLine);
    const pageNums = group.map((item) => item.page.pageNum);
    const pages = group.map((item) => item.page);
    const contextPages = [
      ...contextPagesFor(options.referencePages, group[0]?.index ?? 0).filter(
        (page) => !pageNums.includes(page.pageNum),
      ),
    ];
    const lastContext = contextPagesFor(
      options.referencePages,
      group[group.length - 1]?.index ?? 0,
    ).filter((page) => !pageNums.includes(page.pageNum));
    for (const page of lastContext) {
      if (!contextPages.some((candidate) => candidate.pageNum === page.pageNum)) {
        contextPages.push(page);
      }
    }

    if (markdown.length > largePageChars) {
      const parts = splitMarkdownByBoundaries(markdown, startEntry.startLine, largePageChars);
      if (parts.length === 1 && parts[0]?.oversized === true) oversizedPages.push(...pageNums);
      parts.forEach((part, partIndex) => {
        windows.push({
          pageNums,
          kind: 'text',
          pages,
          contextPages,
          markdown: part.markdown,
          startLine: part.startLine,
          endLine: part.endLine,
          part: partIndex + 1,
          parts: parts.length,
        });
      });
    } else {
      windows.push({
        pageNums,
        kind: 'text',
        pages,
        contextPages,
        markdown,
        startLine: startEntry.startLine,
        endLine: endEntry.endLine,
      });
    }
    scopedPages.push(...pageNums);
  }

  return { windows, scopedPages, unscopedContentPages, oversizedPages };
}

export function windowCacheId(window: PageWindow): string {
  const range = window.pageNums.join('-');
  if (window.parts === undefined || window.parts <= 1) return `pages-${range}`;
  return `pages-${range}-part-${window.part ?? 1}`;
}

export function windowReferenceHash(window: PageWindow): string {
  const text = window.pages
    .map((page) => `${page.pageNum}\u0000${page.kind}\u0000${page.text}\u0000${page.pageMarkdown}`)
    .join('\u0001');
  return text;
}
