import { describe, it, expect } from 'vitest';
import { cacheKey } from './key.js';

const base = {
  chapterMarkdown: '# Unit 1\n\nA fraction is part of a whole.',
  promptVersion: '1',
  model: 'gpt-4o-mini',
  schemaVersion: '1',
};

describe('cacheKey', () => {
  it('is stable for identical inputs', () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
  });

  it('changes when the chapter text changes', () => {
    expect(cacheKey({ ...base, chapterMarkdown: 'different' })).not.toBe(cacheKey(base));
  });

  it('changes when the model changes', () => {
    expect(cacheKey({ ...base, model: 'gpt-4o' })).not.toBe(cacheKey(base));
  });

  it('changes when the prompt or schema version changes', () => {
    expect(cacheKey({ ...base, promptVersion: '2' })).not.toBe(cacheKey(base));
    expect(cacheKey({ ...base, schemaVersion: '2' })).not.toBe(cacheKey(base));
  });

  it('is not confused by field-boundary collisions', () => {
    const a = cacheKey({ ...base, chapterMarkdown: 'ab', model: 'c' });
    const b = cacheKey({ ...base, chapterMarkdown: 'a', model: 'bc' });
    expect(a).not.toBe(b);
  });
});
