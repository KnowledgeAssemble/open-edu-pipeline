import { describe, it, expect } from 'vitest';
import {
  PackManifestSchema,
  ConceptSchema,
  ConceptSourceSchema,
  CurriculumSchema,
} from './index.js';

const baseManifest = {
  format: 'openedu-pack',
  formatVersion: 1,
  type: 'knowledge',
  id: 'nios-math-a-knowledge',
  version: '0.1.0',
  name: 'NIOS Mathematics Level A — Knowledge',
  author: 'KnowledgeAssemble',
  language: 'en',
  derivedFrom: 'document',
} as const;

describe('PackManifestSchema', () => {
  it('parses the example manifest', () => {
    const parsed = PackManifestSchema.parse(baseManifest);
    expect(parsed.format).toBe('openedu-pack');
    expect(parsed.type).toBe('knowledge');
    expect(parsed.id).toBe('nios-math-a-knowledge');
  });

  it('rejects a dotted id', () => {
    expect(PackManifestSchema.safeParse({ ...baseManifest, id: 'nios.math.level-a' }).success).toBe(
      false,
    );
  });

  it('rejects an uppercase id', () => {
    expect(PackManifestSchema.safeParse({ ...baseManifest, id: 'Nios-Math' }).success).toBe(false);
  });

  it('rejects an extra undeclared key', () => {
    expect(PackManifestSchema.safeParse({ ...baseManifest, x: 1 }).success).toBe(false);
  });

  it('accepts derivedFrom "document" and also accepts a manifest without it', () => {
    expect(PackManifestSchema.safeParse(baseManifest).success).toBe(true);
    const { derivedFrom: _derivedFrom, ...withoutDerivedFrom } = baseManifest;
    expect(PackManifestSchema.safeParse(withoutDerivedFrom).success).toBe(true);
  });
});

describe('ConceptSchema', () => {
  const baseConcept = {
    id: 'fraction',
    title: 'Fraction',
    summary: 'A part of a whole divided into equal parts.',
    domainTags: ['mathematics'],
  };

  it('rejects a concept missing summary', () => {
    const { summary: _summary, ...rest } = baseConcept;
    expect(ConceptSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a concept missing domainTags', () => {
    const { domainTags: _domainTags, ...rest } = baseConcept;
    expect(ConceptSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an undeclared "type" key', () => {
    expect(ConceptSchema.safeParse({ ...baseConcept, type: 'concept' }).success).toBe(false);
  });

  it('accepts a concept with all fields including source', () => {
    expect(
      ConceptSchema.safeParse({
        ...baseConcept,
        examples: ['The fraction is 3/4.'],
        misconceptions: [],
        prerequisites: [],
        source: { documentId: 'nios-math-level-a', section: 'introduction' },
      }).success,
    ).toBe(true);
  });
});

describe('ConceptSourceSchema', () => {
  it('accepts documentId, section and page', () => {
    expect(
      ConceptSourceSchema.safeParse({
        documentId: 'nios-math-level-a',
        section: 'introduction',
        page: 43,
      }).success,
    ).toBe(true);
  });

  it('rejects a negative page', () => {
    expect(
      ConceptSourceSchema.safeParse({ documentId: 'nios-math-level-a', page: -1 }).success,
    ).toBe(false);
  });
});

describe('CurriculumSchema', () => {
  const example = {
    id: 'nios-math-level-a',
    title: 'NIOS Mathematics Level A',
    subject: 'mathematics',
    level: 'A',
    units: [
      {
        id: 'fractions',
        title: 'Fractions',
        concepts: [{ pack: 'nios-math-a-knowledge', concept: 'fraction' }],
        objectives: [
          {
            id: 'represent-fractions',
            description: 'Represent fractions',
            concepts: [{ pack: 'nios-math-a-knowledge', concept: 'fraction' }],
            requiresIntents: ['understand', 'practice'],
          },
        ],
      },
    ],
  };

  it('accepts the example shape', () => {
    expect(CurriculumSchema.safeParse(example).success).toBe(true);
  });

  it('rejects an objective without requiresIntents', () => {
    const broken = {
      ...example,
      units: [
        {
          id: 'fractions',
          title: 'Fractions',
          concepts: [{ pack: 'nios-math-a-knowledge', concept: 'fraction' }],
          objectives: [
            {
              id: 'represent-fractions',
              description: 'Represent fractions',
            },
          ],
        },
      ],
    };
    expect(CurriculumSchema.safeParse(broken).success).toBe(false);
  });
});
