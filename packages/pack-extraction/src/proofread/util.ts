import { createHash } from 'node:crypto';

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((sorted, key) => {
          sorted[key] = record[key];
          return sorted;
        }, {});
    }
    return item;
  });
}

/** Collapse whitespace and normalize line endings for evidence/context checks. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
}

/** Normalize line endings and trailing whitespace without changing words. */
export function normalizeLines(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
}

export function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
    if (text[cursor] === '\n') line += 1;
  }
  return line;
}

export function lineCount(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}

export function parsePageRange(spec: string | undefined): number[] | undefined {
  if (!spec) return undefined;
  const pages = new Set<number>();
  for (const part of spec.split(',')) {
    const value = part.trim();
    if (value === '') continue;
    const range = value.split('-');
    if (range.length === 2) {
      const start = Number.parseInt(range[0] ?? '', 10);
      const end = Number.parseInt(range[1] ?? '', 10);
      if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) {
        for (let page = start; page <= end; page += 1) pages.add(page);
      }
      continue;
    }
    const single = Number.parseInt(value, 10);
    if (Number.isInteger(single) && single > 0) pages.add(single);
  }
  return pages.size > 0 ? [...pages].sort((a, b) => a - b) : undefined;
}
