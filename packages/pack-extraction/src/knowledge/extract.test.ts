import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SourceManifest } from '../ingest/types.js';
import { parseMarkdown } from '../source-model/normalize.js';
import { extractKnowledge } from './extract.js';
import { parseGlossaryTerm } from './glossary.js';

const FIXTURE = readFileSync(
  fileURLToPath(new URL('../../../../fixtures/nios-math-a/lesson-5-fractions.md', import.meta.url)),
  'utf8',
);

const MANIFEST: SourceManifest = {
  id: 'nios-math-level-a',
  title: 'Mathematics Level A',
  format: 'markdown',
  filename: 'lesson-5-fractions.md',
};

describe('extractKnowledge', () => {
  const model = extractKnowledge(parseMarkdown(FIXTURE), MANIFEST);

  it('extracts the three glossary concepts in order', () => {
    expect(model.concepts.map((c) => c.id)).toEqual(['fraction', 'numerator', 'denominator']);
  });

  it('extracts one statement per learning objective bullet', () => {
    expect(model.statements).toHaveLength(3);
  });

  it('attaches both examples to the first concept', () => {
    expect(model.concepts[0]?.examples).toHaveLength(2);
  });

  it('extracts three glossary candidates', () => {
    expect(model.glossary).toHaveLength(3);
  });

  it('carries provenance on every concept', () => {
    for (const concept of model.concepts) {
      expect(concept.source.documentId).toBe('nios-math-level-a');
    }
  });
});

describe('parseGlossaryTerm', () => {
  it('parses a term with an em-dash separator', () => {
    expect(parseGlossaryTerm('**Fraction** — a part of a whole divided into equal parts.')).toEqual(
      {
        term: 'Fraction',
        definition: 'a part of a whole divided into equal parts.',
      },
    );
  });

  it('parses a term with a colon separator', () => {
    expect(parseGlossaryTerm('**Numerator**: the number of equal parts we take.')).toEqual({
      term: 'Numerator',
      definition: 'the number of equal parts we take.',
    });
  });

  it('returns null for a plain sentence', () => {
    expect(parseGlossaryTerm('A fraction is part of a whole.')).toBeNull();
  });
});
