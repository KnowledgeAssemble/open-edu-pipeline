import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../cli/index.js';

const output = mkdtempSync(join(tmpdir(), 'pack-extraction-multi-'));
const sourceDir = mkdtempSync(join(tmpdir(), 'pack-extraction-multi-src-'));
const source = join(sourceDir, 'book.md');

const MULTI = `# LESSON ONE

## Learning Objectives

- recognise a shape
- name a shape

## Exercise

1. Draw a circle.

# LESSON TWO

## Learning Objectives

* count to ten
`;

let exitCode = -1;

beforeAll(async () => {
  writeFileSync(source, MULTI, 'utf8');
  exitCode = await run(['--source', source, '--output', output]);
});

afterAll(() => {
  rmSync(output, { recursive: true, force: true });
  rmSync(sourceDir, { recursive: true, force: true });
});

describe('multi-lesson CLI', () => {
  it('exits 0 without an explicit manifest', () => {
    expect(exitCode).toBe(0);
  });

  it('writes one working tree per lesson under lessons/<slug>', () => {
    for (const slug of ['lesson-one', 'lesson-two']) {
      expect(
        existsSync(join(output, 'book', 'lessons', slug, 'source-model', 'source-model.json')),
        slug,
      ).toBe(true);
      expect(
        existsSync(
          join(
            output,
            'book',
            'lessons',
            slug,
            'packs',
            'knowledge',
            `nios-math-a-knowledge-${slug}`,
            'manifest.json',
          ),
        ),
        slug,
      ).toBe(true);
    }
    expect(existsSync(join(output, 'book', 'source-model', 'source-model.json'))).toBe(false);
  });
});
