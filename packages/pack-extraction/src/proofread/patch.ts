import type { PageMap, Patch, PatchRecord } from './types.js';
import { MAX_AUTO_PATCH_CHARS, MAX_AUTO_PATCH_LINES, PROOFREAD_PAGE_MARKER_RE } from './types.js';
import { lineCount, lineNumberAt } from './util.js';

interface NormalizedText {
  text: string;
  indexMap: number[];
}

/** Normalize line endings/trailing whitespace while retaining original offsets. */
function normalizeWithMap(original: string): NormalizedText {
  const parts = original.split(/(\r?\n)/);
  let text = '';
  const indexMap: number[] = [];
  let offset = 0;
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex] ?? '';
    if (part === '\n' || part === '\r\n') {
      text += '\n';
      indexMap.push(offset);
      offset += part.length;
      continue;
    }
    const trimmed = part.replace(/[ \t]+$/g, '');
    for (let index = 0; index < trimmed.length; index += 1) {
      text += trimmed[index];
      indexMap.push(offset + index);
    }
    offset += part.length;
  }
  indexMap.push(original.length);
  return { text, indexMap };
}

export interface ResolvedPatch {
  patch: Patch;
  /** Original Markdown indices. */
  start: number;
  end: number;
  lineStart: number;
  lineEnd: number;
}

export type ResolveResult = { ok: true; resolved: ResolvedPatch } | { ok: false; reason: string };

function normalizeAnchor(value: string): string {
  return normalizeWithMap(value).text;
}

/** Resolve `exact` + `before`/`after` to exactly one location in the raw Markdown. */
export function resolvePatch(patch: Patch, markdown: string): ResolveResult {
  const normalized = normalizeWithMap(markdown);
  const exact = normalizeAnchor(patch.exact);
  if (exact === '') return { ok: false, reason: 'patch anchor is empty' };
  const before = normalizeAnchor(patch.before ?? '');
  const after = normalizeAnchor(patch.after ?? '');

  const occurrences: number[] = [];
  let cursor = 0;
  while (cursor <= normalized.text.length) {
    const found = normalized.text.indexOf(exact, cursor);
    if (found < 0) break;
    occurrences.push(found);
    cursor = found + Math.max(1, exact.length);
  }
  if (occurrences.length === 0) return { ok: false, reason: 'patch anchor not found' };

  const matches = occurrences.filter((index) => {
    const beforeOk =
      before === '' ||
      normalized.text.slice(Math.max(0, index - before.length), index) === before ||
      (!before.endsWith('\n') &&
        normalized.text.slice(Math.max(0, index - before.length - 1), index) === `${before}\n`);
    const afterEnd = index + exact.length;
    const afterOk =
      after === '' ||
      normalized.text.slice(afterEnd, afterEnd + after.length) === after ||
      (!after.startsWith('\n') &&
        normalized.text.slice(afterEnd, afterEnd + after.length + 1) === `\n${after}`);
    return beforeOk && afterOk;
  });

  if (matches.length === 0) {
    return { ok: false, reason: 'patch context did not match any anchor occurrence' };
  }
  if (matches.length > 1) {
    return { ok: false, reason: `patch anchor/context is ambiguous (${matches.length} matches)` };
  }

  const normalizedStart = matches[0] ?? 0;
  const normalizedEnd = normalizedStart + exact.length;
  const start = normalized.indexMap[normalizedStart] ?? 0;
  const end = normalized.indexMap[normalizedEnd] ?? markdown.length;
  const lineStart = lineNumberAt(markdown, start);
  const lineEnd = lineNumberAt(markdown, Math.max(start, end - (end > start ? 1 : 0)));
  return {
    ok: true,
    resolved: {
      patch,
      start,
      end,
      lineStart: Math.min(lineStart, lineEnd),
      lineEnd: Math.max(lineStart, lineEnd),
    },
  };
}

function changedText(patch: Patch): string {
  switch (patch.op) {
    case 'replace':
      return patch.replacement;
    case 'insert-before':
    case 'insert-after':
      return patch.text;
    case 'delete':
      return '';
  }
}

/** Auto-apply size ceiling: 2 000 characters and 40 lines. */
export function patchWithinLimits(patch: Patch): { ok: true } | { ok: false; reason: string } {
  const text = changedText(patch);
  const lines = Math.max(lineCount(text), lineCount(patch.exact));
  const chars = Math.max(text.length, patch.exact.length);
  if (chars > MAX_AUTO_PATCH_CHARS) {
    return { ok: false, reason: `patch exceeds ${MAX_AUTO_PATCH_CHARS} characters` };
  }
  if (lines > MAX_AUTO_PATCH_LINES) {
    return { ok: false, reason: `patch exceeds ${MAX_AUTO_PATCH_LINES} lines` };
  }
  return { ok: true };
}

function isPoint(patch: Patch): boolean {
  return patch.op === 'insert-before' || patch.op === 'insert-after';
}

function priority(patch: Patch): number {
  const origin = patch.origin === 'page-map' ? 0 : 1;
  return origin * 1_000_000 + (patch.order ?? 0);
}

function conflicts(a: ResolvedPatch, b: ResolvedPatch): boolean {
  const aPoint = isPoint(a.patch);
  const bPoint = isPoint(b.patch);
  if (aPoint && bPoint) return false;
  if (aPoint) return a.start > b.start && a.start < b.end;
  if (bPoint) return b.start > a.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}

function applyOne(markdown: string, resolved: ResolvedPatch): string {
  const { patch, start, end } = resolved;
  switch (patch.op) {
    case 'replace':
      return markdown.slice(0, start) + patch.replacement + markdown.slice(end);
    case 'insert-before':
      return markdown.slice(0, start) + patch.text + markdown.slice(start);
    case 'insert-after':
      return markdown.slice(0, end) + patch.text + markdown.slice(end);
    case 'delete':
      return markdown.slice(0, start) + markdown.slice(end);
  }
}

export interface ApplyPatchesResult {
  markdown: string;
  records: PatchRecord[];
  applied: PatchRecord[];
}

/**
 * Resolve and apply patches in descending line order with offset tracking.
 * Overlapping patches are rejected; same-line inserts apply in ascending order
 * with page-map markers before LLM content patches.
 */
export function applyPatches(rawMarkdown: string, patches: Patch[]): ApplyPatchesResult {
  const records: PatchRecord[] = [];
  const resolved: ResolvedPatch[] = [];

  for (const patch of patches) {
    const resolution = resolvePatch(patch, rawMarkdown);
    if (!resolution.ok) {
      records.push({ patch, status: 'rejected', reason: resolution.reason, order: 0 });
      continue;
    }
    const size = patchWithinLimits(patch);
    if (!size.ok) {
      records.push({
        patch,
        status: 'rejected',
        reason: size.reason,
        order: 0,
        lineStart: resolution.resolved.lineStart,
        lineEnd: resolution.resolved.lineEnd,
      });
      continue;
    }
    const overlap = resolved.find((candidate) => conflicts(candidate, resolution.resolved));
    if (overlap) {
      records.push({
        patch,
        status: 'rejected',
        reason: `patch overlaps another patch at line ${overlap.lineStart}`,
        order: 0,
        lineStart: resolution.resolved.lineStart,
        lineEnd: resolution.resolved.lineEnd,
      });
      continue;
    }
    resolved.push(resolution.resolved);
  }

  const ascending = [...resolved].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const aPoint = isPoint(a.patch);
    const bPoint = isPoint(b.patch);
    if (aPoint !== bPoint) return aPoint ? -1 : 1;
    return priority(a.patch) - priority(b.patch);
  });
  ascending.forEach((item, index) => {
    item.patch.order = index + 1;
  });

  const descending = [...ascending].sort((a, b) => {
    if (a.start !== b.start) return b.start - a.start;
    const aPoint = isPoint(a.patch);
    const bPoint = isPoint(b.patch);
    if (aPoint !== bPoint) return aPoint ? 1 : -1;
    return priority(b.patch) - priority(a.patch);
  });

  let markdown = rawMarkdown;
  for (const item of descending) markdown = applyOne(markdown, item);

  for (const item of ascending) {
    records.push({
      patch: item.patch,
      status: 'applied',
      order: item.patch.order ?? 0,
      lineStart: item.lineStart,
      lineEnd: item.lineEnd,
    });
  }

  records.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'applied' ? -1 : 1;
    const aLine = a.lineStart ?? 0;
    const bLine = b.lineStart ?? 0;
    if (aLine !== bLine) return aLine - bLine;
    return a.order - b.order;
  });

  return {
    markdown,
    records,
    applied: records.filter((record) => record.status === 'applied'),
  };
}

export function reconstruct(rawMarkdown: string, records: PatchRecord[]): string {
  const patches = records
    .filter((record) => record.status === 'applied')
    .map((record) => record.patch);
  return applyPatches(rawMarkdown, patches).markdown;
}

function contextBefore(lines: string[], index: number): string {
  return index > 0 ? (lines[index - 1] ?? '') : '';
}

function contextAfter(lines: string[], index: number): string {
  return index + 1 < lines.length ? (lines[index + 1] ?? '') : '';
}

/** Delete existing page-marker comments so re-runs are idempotent. */
export function existingMarkerDeletePatches(markdown: string): Patch[] {
  const lines = markdown.split(/\r?\n/);
  const patches: Patch[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!PROOFREAD_PAGE_MARKER_RE.test(line.trim())) continue;
    const hasTrailingNewline = index + 1 < lines.length;
    patches.push({
      op: 'delete',
      exact: hasTrailingNewline ? `${line}\n` : line,
      before: contextBefore(lines, index),
      after: contextAfter(lines, index),
      origin: 'page-map',
      order: 0,
    });
  }
  return patches;
}

function markerAtSafeBoundary(
  lines: string[],
  entry: { startLine: number; endLine: number },
): number | undefined {
  const startIndex = entry.startLine - 1;
  const endIndex = Math.min(entry.endLine, lines.length) - 1;
  for (let index = startIndex; index <= endIndex; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') continue;
    if (PROOFREAD_PAGE_MARKER_RE.test(line.trim())) return undefined;
    const previous = index > 0 ? (lines[index - 1] ?? '') : '';
    const atBlockStart =
      index === 0 || previous.trim() === '' || PROOFREAD_PAGE_MARKER_RE.test(previous.trim());
    if (!atBlockStart) return undefined;
    return index;
  }
  return undefined;
}

export interface PageMarkerResult {
  patches: Patch[];
  skipped: number[];
}

/** Synthetic marker patches at safe block boundaries for high/medium pages. */
export function pageMarkerPatches(markdown: string, pageMap: PageMap): PageMarkerResult {
  const lines = markdown.split(/\r?\n/);
  const patches: Patch[] = [];
  const skipped: number[] = [];
  for (const entry of pageMap.pages) {
    if (entry.confidence !== 'high' && entry.confidence !== 'medium') {
      skipped.push(entry.pageNum);
      continue;
    }
    const index = markerAtSafeBoundary(lines, entry);
    if (index === undefined) {
      skipped.push(entry.pageNum);
      continue;
    }
    const exact = lines[index] ?? '';
    patches.push({
      op: 'insert-before',
      exact,
      before: contextBefore(lines, index),
      after: '',
      text: `<!-- pdf-page: ${entry.pageNum} -->\n`,
      origin: 'page-map',
      order: entry.pageNum,
    });
  }
  return { patches, skipped };
}
