import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseMarkdown, sectionTypeFor, slugify } from './normalize.js';

const FIXTURE = readFileSync(
  fileURLToPath(new URL('../../../../fixtures/nios-math-a/lesson-5-fractions.md', import.meta.url)),
  'utf8',
);

describe('sectionTypeFor', () => {
  it('maps Learning Objectives to objective', () => {
    expect(sectionTypeFor('Learning Objectives')).toBe('objective');
  });
});

describe('slugify', () => {
  it("slugifies Let's Learn", () => {
    expect(slugify("Let's Learn")).toBe('let-s-learn');
  });

  it('slugifies Example', () => {
    expect(slugify('Example')).toBe('example');
  });
});

describe('parseMarkdown', () => {
  it('parses the fixture into six sections', () => {
    const doc = parseMarkdown(FIXTURE);
    expect(doc.document.title).toBe('Lesson 5: Fractions');
    expect(doc.document.id).toBe('');
    expect(doc.sections.map((s) => s.id)).toEqual([
      'learning-objectives',
      'introduction',
      'let-s-learn',
      'example',
      'exercise',
      'let-s-do-and-learn',
    ]);
    expect(doc.sections.map((s) => s.type)).toEqual([
      'objective',
      'content',
      'content',
      'example',
      'exercise',
      'activity',
    ]);
  });
});
