import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Concept, Curriculum, PackManifest } from '../schemas/index.js';
import { emitKnowledgePack, emitCurriculumPack } from './write.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-extraction-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

describe('emitKnowledgePack', () => {
  it('writes manifest, concepts and sources', () => {
    const out = tempDir();
    const result = emitKnowledgePack({
      outputDir: out,
      manifest: knowledgeManifest,
      concepts,
      sources,
    });
    expect(result.paths).toHaveLength(3);
    for (const path of result.paths) expect(existsSync(path)).toBe(true);
    expect(existsSync(join(out, 'knowledge', 'nios-math-a-knowledge', 'manifest.json'))).toBe(true);
    expect(existsSync(join(out, 'knowledge', 'nios-math-a-knowledge', 'concepts.json'))).toBe(true);
    expect(existsSync(join(out, 'knowledge', 'nios-math-a-knowledge', 'sources.json'))).toBe(true);
  });
});

describe('emitCurriculumPack', () => {
  it('writes manifest, curriculum and sources', () => {
    const out = tempDir();
    const result = emitCurriculumPack({
      outputDir: out,
      manifest: curriculumManifest,
      curriculum,
      sources,
    });
    expect(result.paths).toHaveLength(3);
    for (const path of result.paths) expect(existsSync(path)).toBe(true);
    expect(existsSync(join(out, 'curriculum', 'nios-math-slice', 'curriculum.json'))).toBe(true);
  });
});
