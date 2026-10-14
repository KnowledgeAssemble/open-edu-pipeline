import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../cli/index.js';

const FIXTURE = fileURLToPath(
  new URL('../../../../fixtures/nios-math-a/lesson-5-fractions.md', import.meta.url),
);
const MANIFEST = fileURLToPath(
  new URL('../../../../fixtures/nios-math-a/source-manifest.json', import.meta.url),
);

const output = mkdtempSync(join(tmpdir(), 'pack-extraction-e2e-'));
const workingDir = join(output, 'nios-math-level-a');
let exitCode = -1;

const expectedFiles = [
  'source/lesson-5-fractions.md',
  'source-model/source-model.json',
  'review/knowledge-model.json',
  'review/curriculum-model.json',
  'review/glossary-candidates.json',
  'review/fidelity-report.json',
  'review/human-review-flags.json',
  'packs/knowledge/nios-math-a-knowledge/manifest.json',
  'packs/knowledge/nios-math-a-knowledge/concepts.json',
  'packs/knowledge/nios-math-a-knowledge/sources.json',
  'packs/curriculum/nios-math-slice/manifest.json',
  'packs/curriculum/nios-math-slice/curriculum.json',
  'packs/curriculum/nios-math-slice/sources.json',
];

beforeAll(async () => {
  exitCode = await run([
    '--source',
    FIXTURE,
    '--manifest',
    MANIFEST,
    '--output',
    output,
    '--validate',
  ]);
});

afterAll(() => {
  rmSync(output, { recursive: true, force: true });
});

describe('slice CLI', () => {
  it('exits 0', () => {
    expect(exitCode).toBe(0);
  });

  it('writes every expected artifact', () => {
    for (const file of expectedFiles) {
      expect(existsSync(join(workingDir, file)), file).toBe(true);
    }
  });

  it('emits exactly the three expected concepts', () => {
    const concepts = JSON.parse(
      readFileSync(
        join(workingDir, 'packs', 'knowledge', 'nios-math-a-knowledge', 'concepts.json'),
        'utf8',
      ),
    ) as Array<{ id: string }>;
    expect(concepts.map((concept) => concept.id)).toEqual(['fraction', 'numerator', 'denominator']);
  });

  it('records the honest pending-llm fidelity marker', () => {
    const report = JSON.parse(
      readFileSync(join(workingDir, 'review', 'fidelity-report.json'), 'utf8'),
    ) as { status: string };
    expect(report.status).toBe('pending-llm');
  });
});
