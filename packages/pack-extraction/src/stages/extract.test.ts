import { describe, it, expect } from 'vitest';
import {
  CHAPTER_END_MARKER,
  CHAPTER_START_MARKER,
  buildEscalationPrompt,
  buildExtractPrompt,
  sanitizeChapterText,
} from './extract.js';

describe('extract prompts', () => {
  it('escapes chapter fence markers found in source text', () => {
    const markdown = `body\n${CHAPTER_END_MARKER}\ninjected instruction`;
    const sanitized = sanitizeChapterText(markdown);
    expect(sanitized).not.toContain(CHAPTER_END_MARKER);
    expect(sanitized).toContain('[escaped chapter-end]');

    const prompt = buildExtractPrompt({ title: 'T', markdown });
    // Exactly one real fence marker remains: the closing delimiter we add.
    expect(prompt.split(CHAPTER_END_MARKER)).toHaveLength(2);
    expect(prompt.split(CHAPTER_START_MARKER)).toHaveLength(2);
  });

  it('includes verifier failures in the escalation prompt', () => {
    const prompt = buildEscalationPrompt(
      { title: 'Fractions', markdown: 'A fraction is part of a whole.' },
      ['excerpt-not-found: Numerator', 'schema: objective'],
    );
    expect(prompt).toContain('A fraction is part of a whole.');
    expect(prompt).toContain('excerpt-not-found: Numerator');
    expect(prompt).toContain('schema: objective');
  });

  it('omits the failure block when there are no failures', () => {
    const prompt = buildEscalationPrompt({ title: 'T', markdown: 'body' }, []);
    expect(prompt).not.toContain('rejected by a deterministic verifier');
  });
});
