import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Concept, Curriculum, PackManifest } from '../schemas/index.js';
import { emitKnowledgePack, emitCurriculumPack } from '../emit/write.js';
import { validateKnowledgePack, validateCurriculumPack } from './pack.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-extraction-validate-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const knowledgeManifest: PackManifest = {
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

const curriculumManifest: PackManifest = {
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

function makeConcept(id: string, title: string): Concept {
  return {
    id,
    title,
    summary: `Definition of ${title}.`,
    domainTags: ['mathematics'],
    source: { documentId: 'nios-math-level-a', section: 'introduction' },
  };
}

const concepts: Concept[] = [
  makeConcept('fraction', 'Fraction'),
  makeConcept('numerator', 'Numerator'),
  makeConcept('denominator', 'Denominator'),
];

const sources = {
  documents: [
    {
      documentId: 'nios-math-level-a',
      title: 'Mathematics Level A',
      file: 'lesson-5-fractions.md',
    },
  ],
};

const curriculum: Curriculum = {
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
          concepts: [{ pack: 'nios-math-a-knowledge', concept: 'denominator' }],
          requiresIntents: ['understand'],
        },
      ],
    },
  ],
};

const conceptIds = new Set(concepts.map((concept) => concept.id));

function emitValidTree(outputDir: string): { knowledgeDir: string; curriculumDir: string } {
  emitKnowledgePack({ outputDir, manifest: knowledgeManifest, concepts, sources });
  emitCurriculumPack({ outputDir, manifest: curriculumManifest, curriculum, sources });
  return {
    knowledgeDir: join(outputDir, 'knowledge', 'nios-math-a-knowledge'),
    curriculumDir: join(outputDir, 'curriculum', 'nios-math-slice'),
  };
}

function mutateJson(filePath: string, mutate: (value: unknown) => void): void {
  const value = JSON.parse(readFileSync(filePath, 'utf8'));
  mutate(value);
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

describe('validateKnowledgePack', () => {
  it('accepts a valid emitted pack', () => {
    const { knowledgeDir } = emitValidTree(tempDir());
    const result = validateKnowledgePack(knowledgeDir);
    expect(result.ok).toBe(true);
  });

  it('rejects an extra key in concepts.json', () => {
    const { knowledgeDir } = emitValidTree(tempDir());
    mutateJson(join(knowledgeDir, 'concepts.json'), (value) => {
      const list = value as Array<Record<string, unknown>>;
      const first = list[0];
      if (first) first.x = 1;
    });
    const result = validateKnowledgePack(knowledgeDir);
    expect(result.ok).toBe(false);
  });

  it('rejects a concept with no source when derivedFrom is document', () => {
    const { knowledgeDir } = emitValidTree(tempDir());
    mutateJson(join(knowledgeDir, 'concepts.json'), (value) => {
      const list = value as Array<Record<string, unknown>>;
      const first = list[0];
      if (first) delete first.source;
    });
    const result = validateKnowledgePack(knowledgeDir);
    expect(result.ok).toBe(false);
  });

  it('rejects a prerequisite cycle', () => {
    const { knowledgeDir } = emitValidTree(tempDir());
    mutateJson(join(knowledgeDir, 'concepts.json'), (value) => {
      const list = value as Array<Record<string, unknown>>;
      const first = list[0];
      const second = list[1];
      if (first) first.prerequisites = ['numerator'];
      if (second) second.prerequisites = ['fraction'];
    });
    const result = validateKnowledgePack(knowledgeDir);
    expect(result.ok).toBe(false);
  });
});

describe('validateCurriculumPack', () => {
  it('accepts a valid emitted pack', () => {
    const { curriculumDir } = emitValidTree(tempDir());
    const result = validateCurriculumPack(curriculumDir, conceptIds);
    expect(result.ok).toBe(true);
  });

  it('rejects a reference to an unknown concept', () => {
    const { curriculumDir } = emitValidTree(tempDir());
    mutateJson(join(curriculumDir, 'curriculum.json'), (value) => {
      const data = value as { units: Array<{ concepts: unknown[] }> };
      const unit = data.units[0];
      if (unit) unit.concepts = [{ pack: 'nios-math-a-knowledge', concept: 'misspell' }];
    });
    const result = validateCurriculumPack(curriculumDir, conceptIds);
    expect(result.ok).toBe(false);
  });
});
