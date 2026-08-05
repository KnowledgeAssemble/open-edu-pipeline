export type DocumentScope =
  | { kind: 'all' }
  | { kind: 'chapter-index'; index: number }
  | { kind: 'chapter-id'; id: string }
  | { kind: 'pages'; start: number; end: number }
  | { kind: 'source-units'; ids: string[] };

export function parseScope(raw: string): DocumentScope {
  if (raw === 'all') return { kind: 'all' };
  if (raw.startsWith('chapter-index:')) {
    const index = parseInt(raw.slice('chapter-index:'.length), 10);
    if (isNaN(index) || index < 1) throw new Error(`Invalid chapter index: ${raw}. Must be >= 1.`);
    return { kind: 'chapter-index', index };
  }
  if (raw.startsWith('chapter-id:')) {
    const id = raw.slice('chapter-id:'.length);
    if (!id) throw new Error(`Invalid chapter ID: ${raw}. ID must not be empty.`);
    return { kind: 'chapter-id', id };
  }
  if (raw.startsWith('pages:')) {
    const range = raw.slice('pages:'.length);
    const [startStr, endStr] = range.split('-');
    const start = parseInt(startStr!, 10);
    const end = parseInt(endStr!, 10);
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      throw new Error(`Invalid page range: ${raw}. Format: pages:1-5`);
    }
    return { kind: 'pages', start, end };
  }
  if (raw.startsWith('source-units:')) {
    const ids = raw
      .slice('source-units:'.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0)
      throw new Error(`Invalid source units: ${raw}. Must specify at least one ID.`);
    return { kind: 'source-units', ids };
  }
  throw new Error(
    `Unknown scope format: ${raw}. Valid: all, chapter-index:N, chapter-id:ID, pages:A-B, source-units:id,id`,
  );
}

export function scopeToString(scope: DocumentScope): string {
  switch (scope.kind) {
    case 'all':
      return 'all';
    case 'chapter-index':
      return `chapter-index:${scope.index}`;
    case 'chapter-id':
      return `chapter-id:${scope.id}`;
    case 'pages':
      return `pages:${scope.start}-${scope.end}`;
    case 'source-units':
      return `source-units:${scope.ids.join(',')}`;
  }
}
