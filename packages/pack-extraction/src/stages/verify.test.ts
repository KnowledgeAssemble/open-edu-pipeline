import { describe, it, expect } from 'vitest';
import type { Chapter } from '../chapters/types.js';
import { cappedId, isGrounded, normalizeWs, stripMarkdown, verifyExtraction } from './verify.js';

const chapter: Chapter = {
  id: 'unit-1',
  title: 'Unit 1',
  sha256: 'sha',
  markdown: [
    '# Unit 1 Fractions',
    '',
    'A fraction represents part of a whole.',
    '',
    'The numerator is the top number.',
  ].join('\n'),
};

function verify(concepts: Array<{ term: string; summary: string; excerpt: string }>) {
  return verifyExtraction(
    chapter,
    { concepts, objectives: [], examples: [], prerequisites: [] },
    { usedConceptIds: new Set() },
  );
}

describe('grounding helpers', () => {
  it('normalizes whitespace', () => {
    expect(normalizeWs('  a\n b\tc ')).toBe('a b c');
  });

  it('strips markdown markers', () => {
    expect(stripMarkdown('# Title\n**bold** `code`')).toBe('Title\nbold code');
  });

  it('accepts verbatim excerpts and rejects invented ones', () => {
    expect(isGrounded('part of a whole', chapter.markdown)).toBe(true);
    expect(isGrounded('invented claim', chapter.markdown)).toBe(false);
    expect(isGrounded('', chapter.markdown)).toBe(false);
  });
});

describe('cappedId', () => {
  it('clamps to the pack id limit, trimming any trailing separator', () => {
    expect(cappedId('a'.repeat(200)).length).toBe(128);
    const cropped = cappedId(`${'a'.repeat(127)}-xyz`);
    expect(cropped.length).toBeLessThanOrEqual(128);
    expect(cropped.endsWith('-')).toBe(false);
    expect(cappedId('short')).toBe('short');
  });
});

describe('verifyExtraction', () => {
  it('keeps grounded concepts and assigns bare slugs', () => {
    const result = verify([
      { term: 'Fraction', summary: 'part of a whole', excerpt: 'part of a whole' },
    ]);
    expect(result.concepts.map((concept) => concept.id)).toEqual(['fraction']);
    expect(result.concepts[0]?.origin).toBe('derived');
  });

  it('rejects ungrounded concepts', () => {
    const result = verify([
      { term: 'Myth', summary: 'not there', excerpt: 'this text is absent' },
      { term: 'Fraction', summary: 'part of a whole', excerpt: 'part of a whole' },
    ]);
    expect(result.concepts.map((concept) => concept.id)).toEqual(['fraction']);
    expect(result.rejections).toEqual([
      { item: 'Myth', reason: 'excerpt-not-found', excerpt: 'this text is absent' },
    ]);
  });

  it('gives later duplicate terms a chapter-scoped temporary id', () => {
    const result = verify([
      { term: 'Fraction', summary: 'part of a whole', excerpt: 'part of a whole' },
      { term: 'Fraction', summary: 'part of a whole', excerpt: 'part of a whole' },
    ]);
    expect(result.concepts.map((concept) => concept.id)).toEqual(['fraction', 'unit-1--fraction']);
  });

  it('marks a chapter unhealthy when there are no objectives', () => {
    const result = verify([
      { term: 'Fraction', summary: 'part of a whole', excerpt: 'part of a whole' },
    ]);
    expect(result.healthy).toBe(false);
  });

  it('clamps very long objective ids to the schema limit', () => {
    const longText = `Students ${'will be able to '.repeat(20)}understand numbers`;
    const longChapter: Chapter = { ...chapter, markdown: `# Unit 1\n\n${longText}` };
    const result = verifyExtraction(
      longChapter,
      {
        concepts: [],
        objectives: [{ statement: longText, excerpt: longText }],
        examples: [],
        prerequisites: [],
      },
      { usedConceptIds: new Set() },
    );
    const id = result.objectives[0]?.id ?? '';
    expect(id.length).toBeLessThanOrEqual(128);
    expect(id).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
  });

  it('clamps very long concept ids to the schema limit', () => {
    const result = verify([
      { term: 'A'.repeat(400), summary: 'part of a whole', excerpt: 'part of a whole' },
    ]);
    expect(result.concepts[0]?.id.length).toBeLessThanOrEqual(128);
  });

  it('assigns page numbers when the source carries form feeds', () => {
    const paged: Chapter = {
      ...chapter,
      markdown: 'page one text\fA fraction represents part of a whole.',
    };
    const result = verifyExtraction(
      paged,
      {
        concepts: [{ term: 'Fraction', summary: 'part of a whole', excerpt: 'part of a whole' }],
        objectives: [],
        examples: [],
        prerequisites: [],
      },
      { usedConceptIds: new Set() },
    );
    expect(result.concepts[0]?.page).toBe(2);
  });
});
