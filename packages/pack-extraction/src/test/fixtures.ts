import type { Concept, Curriculum, PackManifest } from '../schemas/index.js';

export const knowledgeManifest: PackManifest = {
  format: 'openedu-pack',
  formatVersion: 1,
  type: 'knowledge',
  id: 'nios-math-a-knowledge',
  version: '0.1.0',
  name: 'NIOS Mathematics Level A — Knowledge',
  author: 'KnowledgeAssemble',
  language: 'en',
  requires: [],
  derivedFrom: 'document',
};

export const curriculumManifest: PackManifest = {
  format: 'openedu-pack',
  formatVersion: 1,
  type: 'curriculum',
  id: 'nios-math-slice',
  version: '0.1.0',
  name: 'NIOS Mathematics Level A — Curriculum Slice',
  author: 'KnowledgeAssemble',
  language: 'en',
  requires: [],
  derivedFrom: 'document',
};

export const concepts: Concept[] = [
  {
    id: 'fraction',
    title: 'Fraction',
    summary: 'A part of a whole divided into equal parts.',
    domainTags: ['mathematics'],
    source: { documentId: 'nios-math-level-a', section: 'introduction' },
  },
  {
    id: 'numerator',
    title: 'Numerator',
    summary: 'The number of equal parts we take.',
    domainTags: ['mathematics'],
    source: { documentId: 'nios-math-level-a', section: 'introduction' },
  },
  {
    id: 'denominator',
    title: 'Denominator',
    summary: 'The total number of equal parts.',
    domainTags: ['mathematics'],
    source: { documentId: 'nios-math-level-a', section: 'introduction' },
  },
];

export const sources = {
  documents: [
    {
      documentId: 'nios-math-level-a',
      title: 'Mathematics Level A',
      file: 'lesson-5-fractions.md',
    },
  ],
};

export const curriculum: Curriculum = {
  id: 'nios-math-slice',
  title: 'Lesson 5: Fractions',
  subject: 'mathematics',
  level: 'A',
  units: [
    {
      id: 'lesson-5-fractions',
      title: 'Lesson 5: Fractions',
      concepts: [{ pack: 'nios-math-a-knowledge', concept: 'fraction' }],
      prerequisites: [],
      objectives: [
        {
          id: 'recognise-a-fraction',
          description: 'Recognise a fraction as a part of a whole.',
          bloomLevel: 'understand',
          concepts: [{ pack: 'nios-math-a-knowledge', concept: 'fraction' }],
          requiresIntents: ['understand'],
        },
      ],
    },
  ],
};

export const conceptIds = new Set(concepts.map((concept) => concept.id));
