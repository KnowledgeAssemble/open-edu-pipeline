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

  it('strips list markers and separator rows', () => {
    expect(stripMarkdown('- apple\n1. pear')).toBe('apple\npear');
    expect(stripMarkdown('| a | b |\n|---|---|')).not.toContain('---');
  });

  it('accepts verbatim excerpts and rejects invented ones', () => {
    expect(isGrounded('part of a whole', chapter.markdown)).toBe(true);
    expect(isGrounded('invented claim', chapter.markdown)).toBe(false);
    expect(isGrounded('', chapter.markdown)).toBe(false);
  });

  it('accepts excerpts that drop list/bullet markers present in the source', () => {
    const source = [
      '# Numbers',
      '',
      '- Three digit number is called hundreds.',
      '| • | digits and words. |',
    ].join('\n');
    expect(isGrounded('Three digit number is called hundreds.', source)).toBe(true);
    expect(isGrounded('digits and words.', source)).toBe(true);
  });

  it('accepts an excerpt spanning a table separator row', () => {
    const source = [
      '| We will learn in this lesson |  |',
      '|---|---|',
      '| digits and words. |',
    ].join('\n');
    expect(isGrounded('We will learn in this lesson digits and words.', source)).toBe(true);
  });

  it('accepts an excerpt that drops the LaTeX math delimiters of the source', () => {
    const source = 'In the expanded form we write as:\n$65 = 60 + 5$';
    expect(isGrounded('In the expanded form we write as: 65 = 60 + 5', source)).toBe(true);
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

describe('objective→concept links', () => {
  const linked: Chapter = {
    id: 'unit-1',
    title: 'Unit 1',
    sha256: 'sha',
    markdown: [
      '# Unit 1 Numbers',
      '',
      '### We will learn in this lesson',
      '- Read place values of digits.',
      '',
      '### 1.1 Place value',
      '',
      'Place value is the value of a digit by its position.',
      '',
      '### 1.2 Two digit numbers',
      '',
      'A two digit number has two digits.',
      '',
      '### 1.3 Three digit numbers',
      '',
      'A three digit number is called hundreds.',
    ].join('\n'),
  };

  function extract(
    objectives: Array<{ statement: string; excerpt: string; conceptTerms?: string[] }>,
  ) {
    return verifyExtraction(
      linked,
      {
        concepts: [
          {
            term: 'Place value',
            summary: 'value of a digit',
            excerpt: 'Place value is the value of a digit by its position.',
          },
          {
            term: 'Two digit number',
            summary: 'two digits',
            excerpt: 'A two digit number has two digits.',
          },
          {
            term: 'Three digit numbers',
            summary: 'hundreds',
            excerpt: 'A three digit number is called hundreds.',
          },
        ],
        objectives: objectives.map((objective) => ({
          ...objective,
          conceptTerms: objective.conceptTerms ?? [],
        })),
        examples: [],
        prerequisites: [],
      },
      { usedConceptIds: new Set() },
    );
  }

  it('links the concepts the model named for the objective', () => {
    const result = extract([
      {
        statement: 'Read place values of digits.',
        excerpt: 'Read place values of digits.',
        conceptTerms: ['Place value'],
      },
    ]);
    expect(result.objectives[0]?.concepts).toEqual(['place-value']);
  });

  it('ignores concept terms that name no extracted concept', () => {
    const result = extract([
      {
        statement: 'Read place values of digits.',
        excerpt: 'Read place values of digits.',
        conceptTerms: ['Place value', 'Invented term'],
      },
    ]);
    expect(result.objectives[0]?.concepts).toEqual(['place-value']);
  });

  it('falls back to the concepts of the same section', () => {
    const result = extract([
      {
        statement: 'A two digit number has two digits.',
        excerpt: 'A two digit number has two digits.',
      },
    ]);
    expect(result.objectives[0]?.concepts).toEqual(['two-digit-number']);
  });

  it('never links every chapter concept to one objective', () => {
    const result = extract([
      {
        statement: 'Read place values of digits.',
        excerpt: 'Read place values of digits.',
      },
    ]);
    expect(result.objectives[0]?.concepts.length).toBeLessThan(3);
  });
});

describe('objective granularity', () => {
  const nested: Chapter = {
    id: 'unit-1',
    title: 'Unit 1',
    sha256: 'sha',
    markdown: [
      '# Unit 1 Numbers',
      '',
      '### We will learn in this lesson',
      '- Read place values of digits.',
      '  - (i) Place value of two digit numbers.',
      '  - (ii) Place value of three digit numbers.',
      '',
      '### 1.1 Place value',
      '',
      'Place value is the value of a digit by its position.',
      '',
      '### 1.2 Two digit numbers',
      '',
      'A two digit number has two digits.',
      '',
      '### 1.3 Three digit numbers',
      '',
      'A three digit number is called hundreds.',
    ].join('\n'),
  };

  it('splits an objective that covers a parent bullet and its sub-bullets', () => {
    const result = verifyExtraction(
      nested,
      {
        concepts: [
          {
            term: 'Two digit number',
            summary: 'two digits',
            excerpt: 'A two digit number has two digits.',
          },
          {
            term: 'Three digit numbers',
            summary: 'hundreds',
            excerpt: 'A three digit number is called hundreds.',
          },
        ],
        objectives: [
          {
            statement: 'Read place values of digits.',
            excerpt:
              'Read place values of digits. (i) Place value of two digit numbers. (ii) Place value of three digit numbers.',
            conceptTerms: [],
          },
        ],
        examples: [],
        prerequisites: [],
      },
      { usedConceptIds: new Set() },
    );

    expect(result.objectives.map((objective) => objective.statement)).toEqual([
      'Read place values of digits.',
      'Place value of two digit numbers.',
      'Place value of three digit numbers.',
    ]);
    expect(result.coverage.statedObjectives).toBe(3);
    expect(result.coverage.objectiveGap).toBe(0);
  });

  it('keeps the model statement when the objective covers a single bullet', () => {
    const result = verifyExtraction(
      nested,
      {
        concepts: [],
        objectives: [
          {
            statement: 'Read place values of digits.',
            excerpt: 'Read place values of digits.',
            conceptTerms: [],
          },
        ],
        examples: [],
        prerequisites: [],
      },
      { usedConceptIds: new Set() },
    );

    expect(result.objectives).toHaveLength(1);
    expect(result.objectives[0]?.statement).toBe('Read place values of digits.');
  });
});

describe('chapter health', () => {
  const healthChapter: Chapter = {
    id: 'unit-1',
    title: 'Unit 1',
    sha256: 'sha',
    markdown: [
      '# Unit 1 Numbers',
      '',
      '### We will learn in this lesson',
      '- Read place values of digits.',
      '- Read three digit numbers.',
      '',
      '### 1.1 Place value',
      '',
      'Place value is the value of a digit by its position.',
      '',
      '### 1.2 Three digit numbers',
      '',
      'A three digit number is called hundreds.',
      '',
      '### 1.4 Number names',
      '',
      'Numbers are written in words.',
    ].join('\n'),
  };

  function verifyWith(objectiveCount: number) {
    const objectives = Array.from({ length: objectiveCount }, (_, index) => ({
      statement: `Objective ${index}`,
      excerpt: 'Place value is the value of a digit by its position.',
      conceptTerms: [],
    }));
    return verifyExtraction(
      healthChapter,
      {
        concepts: [
          {
            term: 'Place value',
            summary: 'value of a digit',
            excerpt: 'Place value is the value of a digit by its position.',
          },
        ],
        objectives,
        examples: [],
        prerequisites: [],
      },
      { usedConceptIds: new Set() },
    );
  }

  it('marks the chapter unhealthy when stated objectives were not extracted', () => {
    const result = verifyWith(1);
    expect(result.coverage.statedObjectives).toBe(2);
    expect(result.coverage.objectiveGap).toBe(1);
    expect(result.healthy).toBe(false);
    expect(result.failures.join(' ')).toContain('objective-gap');
  });

  it('marks the chapter unhealthy when teaching sections have no concept', () => {
    const result = verifyWith(2);
    expect(result.coverage.teachingSections).toBe(3);
    expect(result.coverage.lowCoverage).toBe(true);
    expect(result.healthy).toBe(false);
    expect(result.failures.join(' ')).toContain('uncovered-section');
  });

  it('keeps a fully covered chapter healthy', () => {
    const result = verifyExtraction(
      healthChapter,
      {
        concepts: [
          {
            term: 'Place value',
            summary: 'value of a digit',
            excerpt: 'Place value is the value of a digit by its position.',
          },
          {
            term: 'Three digit numbers',
            summary: 'hundreds',
            excerpt: 'A three digit number is called hundreds.',
          },
          {
            term: 'Number names',
            summary: 'written in words',
            excerpt: 'Numbers are written in words.',
          },
        ],
        objectives: [
          {
            statement: 'Read place values of digits.',
            excerpt: 'Read place values of digits.',
            conceptTerms: [],
          },
          {
            statement: 'Read three digit numbers.',
            excerpt: 'Read three digit numbers.',
            conceptTerms: [],
          },
        ],
        examples: [],
        prerequisites: [],
      },
      { usedConceptIds: new Set() },
    );
    expect(result.coverage.coverageRatio).toBe(1);
    expect(result.coverage.objectiveGap).toBe(0);
    expect(result.healthy).toBe(true);
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
        objectives: [{ statement: longText, excerpt: longText, conceptTerms: [] }],
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
