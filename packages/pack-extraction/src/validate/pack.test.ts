import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitKnowledgePack, emitCurriculumPack } from '../emit/write.js';
import { validateKnowledgePack, validateCurriculumPack } from './pack.js';
import {
  knowledgeManifest,
  curriculumManifest,
  concepts,
  sources,
  curriculum,
  conceptIds,
} from '../test/fixtures.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-extraction-validate-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

  it('rejects a non-knowledge manifest type', () => {
    const { knowledgeDir } = emitValidTree(tempDir());
    mutateJson(join(knowledgeDir, 'manifest.json'), (value) => {
      const manifest = value as { type: string };
      manifest.type = 'curriculum';
    });
    const result = validateKnowledgePack(knowledgeDir);
    expect(result.ok).toBe(false);
  });
});

describe('validateCurriculumPack', () => {
  it('accepts a valid emitted pack', () => {
    const { curriculumDir } = emitValidTree(tempDir());
    const result = validateCurriculumPack(curriculumDir, 'nios-math-a-knowledge', conceptIds);
    expect(result.ok).toBe(true);
  });

  it('rejects a reference to an unknown concept', () => {
    const { curriculumDir } = emitValidTree(tempDir());
    mutateJson(join(curriculumDir, 'curriculum.json'), (value) => {
      const data = value as { units: Array<{ concepts: { pack: string; concept: string }[] }> };
      const unit = data.units[0];
      if (unit) unit.concepts = [{ pack: 'nios-math-a-knowledge', concept: 'misspell' }];
    });
    const result = validateCurriculumPack(curriculumDir, 'nios-math-a-knowledge', conceptIds);
    expect(result.ok).toBe(false);
  });

  it('rejects a reference to a valid concept from an unexpected pack', () => {
    const { curriculumDir } = emitValidTree(tempDir());
    mutateJson(join(curriculumDir, 'curriculum.json'), (value) => {
      const data = value as { units: Array<{ concepts: { pack: string; concept: string }[] }> };
      const unit = data.units[0];
      if (unit) unit.concepts = [{ pack: 'unknown-pack', concept: 'fraction' }];
    });
    const result = validateCurriculumPack(curriculumDir, 'nios-math-a-knowledge', conceptIds);
    expect(result.ok).toBe(false);
  });
});
