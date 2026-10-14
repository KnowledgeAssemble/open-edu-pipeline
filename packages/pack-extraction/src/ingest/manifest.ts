import { basename, extname } from 'node:path';
import type { SourceManifest } from './types.js';
import { slugify } from '../source-model/normalize.js';

/**
 * Derive a backwards-compatible source manifest from a file path when the caller
 * does not provide one. `format` is the lowercase file extension (without dot).
 */
export function deriveManifest(filePath: string, inferredTitle?: string): SourceManifest {
  const filename = basename(filePath);
  const extension = extname(filename).replace(/^\./, '').toLowerCase();
  const base = filename.slice(0, filename.length - extname(filename).length);

  return {
    id: slugify(base) || 'source',
    title: inferredTitle ?? humanize(base),
    format: extension === 'markdown' ? 'markdown' : extension || 'unknown',
    filename,
    parser: 'liteparse',
  };
}

function humanize(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled Source';
}
