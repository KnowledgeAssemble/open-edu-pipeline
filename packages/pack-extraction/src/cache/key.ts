import { createHash } from 'node:crypto';

export interface CacheKeyInput {
  chapterMarkdown: string;
  promptVersion: string;
  model: string;
  schemaVersion: string;
}

/** Cache key = sha256(chapterMarkdown + promptVersion + model + schemaVersion). */
export function cacheKey(input: CacheKeyInput): string {
  return createHash('sha256')
    .update(
      [input.chapterMarkdown, input.promptVersion, input.model, input.schemaVersion].join('\u0000'),
    )
    .digest('hex');
}
