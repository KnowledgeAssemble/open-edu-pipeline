import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPacksDir } from '@open-edu/packs/loader';
import { resolveAuthoringContext } from '@open-edu/packs';
import type { PackDiagnostic } from '@open-edu/packs';
import { emitKnowledgePack, emitCurriculumPack } from '../emit/write.js';
import {
  knowledgeManifest,
  curriculumManifest,
  concepts,
  sources,
  curriculum,
} from '../test/fixtures.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'open-edu-conformance-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const errors = (diagnostics: PackDiagnostic[]): PackDiagnostic[] =>
  diagnostics.filter((d) => d.severity === 'error');

// Contract test: what we emit must load and resolve through the *published* Course Creator
// Studio consumer (@open-edu/packs loader + resolver), not just our own schemas. This is the
// regression guard for the KNOWLEDGE_SOURCE_MISSING / PACK_REFERENCE_MISSING class of bugs.
describe('emitted packs conform to the @open-edu/packs loader and resolver', () => {
  it('loads and resolves the emitted knowledge + curriculum packs with no errors', () => {
    const out = tempDir();
    emitKnowledgePack({ outputDir: out, manifest: knowledgeManifest, concepts, sources });
    emitCurriculumPack({ outputDir: out, manifest: curriculumManifest, curriculum, sources });

    const { packs, diagnostics: loadDiagnostics } = loadPacksDir(out);
    expect(errors(loadDiagnostics)).toEqual([]);
    expect(packs.has(knowledgeManifest.id)).toBe(true);
    expect(packs.has(curriculumManifest.id)).toBe(true);

    const { context, diagnostics: resolveDiagnostics } = resolveAuthoringContext(packs, {
      curriculum: curriculumManifest.id,
      unit: 'lesson-5-fractions',
    });
    expect(errors(resolveDiagnostics)).toEqual([]);
    // The only expected diagnostic is the capability gap: no activity catalog was supplied,
    // so the single objective matches nothing. Any other code would be a real regression.
    expect(resolveDiagnostics.map((d) => d.code)).toEqual(['CAPABILITY_GAP']);
    expect(context.objectives).toHaveLength(1);

    // Concepts are resolved from the pack declared in curriculum.requires.
    expect(context.concepts.map((c) => c.ref.concept)).toContain('fraction');
    // Provenance traces back to the emitted source document.
    expect(context.provenance).toContainEqual({
      pack: knowledgeManifest.id,
      version: knowledgeManifest.version,
      documents: ['nios-math-level-a'],
    });
    // The curriculum's declared dependency is surfaced as a selected pack.
    expect(context.packs.map((p) => p.id)).toContain(knowledgeManifest.id);
  });
});
