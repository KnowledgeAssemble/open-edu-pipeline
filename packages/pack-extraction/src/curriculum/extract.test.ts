import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SourceManifest } from '../ingest/types.js';
import { parseMarkdown } from '../source-model/normalize.js';
import { extractKnowledge } from '../knowledge/extract.js';
import { CurriculumSchema } from '../schemas/index.js';
import { extractCurriculum, toCurriculum } from './extract.js';

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

const doc = parseMarkdown(FIXTURE);
doc.document.id = MANIFEST.id;
const knowledge = extractKnowledge(doc, MANIFEST);
const curriculum = toCurriculum(extractCurriculum(knowledge, doc), {
  knowledgePackId: 'nios-math-a-knowledge',
  curriculumPackId: 'nios-math-slice',
});

describe('toCurriculum', () => {
  it('is valid against the @open-edu/packs schema', () => {
    expect(CurriculumSchema.safeParse(curriculum).success).toBe(true);
  });

  it('uses the curriculum pack id', () => {
    expect(curriculum.id).toBe('nios-math-slice');
  });

  it('gives every objective the understand intent', () => {
    for (const unit of curriculum.units) {
      for (const objective of unit.objectives) {
        expect(objective.requiresIntents).toEqual(['understand']);
      }
    }
  });

  it('qualifies every concept reference with the knowledge pack id', () => {
    const knownConcepts = new Set(knowledge.concepts.map((concept) => concept.id));
    for (const unit of curriculum.units) {
      for (const ref of unit.concepts) {
        expect(ref.pack).toBe('nios-math-a-knowledge');
        expect(knownConcepts.has(ref.concept)).toBe(true);
      }
      for (const objective of unit.objectives) {
        for (const ref of objective.concepts) {
          expect(ref.pack).toBe('nios-math-a-knowledge');
          expect(knownConcepts.has(ref.concept)).toBe(true);
        }
      }
    }
  });
});

describe('extractCurriculum id capping', () => {
  it('caps unit and objective ids to the 128 limit so the curriculum still parses', () => {
    const longTitle = 'A'.repeat(200);
    const longStatement = 'Recognise '.repeat(40);
    const longDoc = parseMarkdown(`# ${longTitle}\n\n## Objectives\n* ${longStatement}\n`);
    longDoc.document.id = 'long-doc';
    const longKnowledge = extractKnowledge(longDoc, {
      id: 'long-doc',
      title: longTitle,
      format: 'markdown',
      filename: 'long.md',
    });

    const built = toCurriculum(extractCurriculum(longKnowledge, longDoc), {
      knowledgePackId: 'long-knowledge',
      curriculumPackId: 'long-curriculum',
    });

    expect(CurriculumSchema.safeParse(built).success).toBe(true);
    for (const unit of built.units) {
      expect(unit.id.length).toBeLessThanOrEqual(128);
      for (const objective of unit.objectives) {
        expect(objective.id.length).toBeLessThanOrEqual(128);
      }
    }
  });
});
