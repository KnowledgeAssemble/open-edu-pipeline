import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitKnowledgePack, emitCurriculumPack } from './write.js';
import {
  knowledgeManifest,
  curriculumManifest,
  concepts,
  sources,
  curriculum,
} from '../test/fixtures.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-extraction-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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
    const written = JSON.parse(
      readFileSync(join(out, 'knowledge', 'nios-math-a-knowledge', 'sources.json'), 'utf8'),
    ) as Record<string, { title: string }>;
    expect(Array.isArray(written)).toBe(false);
    expect(written['nios-math-level-a']?.title).toBe('Mathematics Level A');
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
