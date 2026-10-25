import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { run } from '../../cli/index.js';

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proofread-cli-'));
  dirs.push(dir);
  return dir;
}

const MARKDOWN = `# LESSON ONE

## Learning Objectives

- recognise a shape

## Exercise

1. Draw a circle.
`;

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('pack-extract proofreading pre-stage', () => {
  it('writes a stage-aware dry-run plan and does not run extraction', async () => {
    const sourceDir = tempDir();
    const output = tempDir();
    const source = join(sourceDir, 'book.md');
    writeFileSync(source, MARKDOWN, 'utf8');

    const code = await run(['--source', source, '--output', output, '--proofread', '--dry-run']);

    expect(code).toBe(0);
    const root = join(output, 'book');
    expect(existsSync(join(root, 'review', 'proofread', 'dry-run.json'))).toBe(true);
    expect(existsSync(join(root, 'review', 'proofread', 'page-map.json'))).toBe(true);
    expect(existsSync(join(root, 'review', 'proofread', 'status.json'))).toBe(true);
    expect(existsSync(join(root, 'packs'))).toBe(false);

    const status = JSON.parse(
      readFileSync(join(root, 'review', 'proofread', 'status.json'), 'utf8'),
    ) as { status: string; pageMapAvailable: boolean; downstreamSource: string };
    expect(status.status).toBe('PARTIAL');
    expect(status.pageMapAvailable).toBe(false);
    expect(status.downstreamSource).toBe('raw');
  });

  it('falls back to raw Markdown and continues extraction when no PDF/API key is available', async () => {
    const sourceDir = tempDir();
    const output = tempDir();
    const source = join(sourceDir, 'book.md');
    writeFileSync(source, MARKDOWN, 'utf8');

    const code = await run(['--source', source, '--output', output, '--proofread']);

    expect(code).toBe(0);
    const root = join(output, 'book');
    const status = JSON.parse(
      readFileSync(join(root, 'review', 'proofread', 'status.json'), 'utf8'),
    ) as { status: string; downstreamSource: string; partialFallbackUsed: boolean };
    expect(status.status).toBe('PARTIAL');
    expect(status.downstreamSource).toBe('raw');
    expect(status.partialFallbackUsed).toBe(true);
    expect(readFileSync(join(root, 'source', 'book.proofread.md'), 'utf8')).toBe(MARKDOWN);
    expect(existsSync(join(root, 'packs', 'knowledge'))).toBe(true);
    expect(existsSync(join(root, 'review', 'proofread-status.json'))).toBe(true);
  });

  it('exits 1 on a non-passing proofread with --proofread-strict', async () => {
    const sourceDir = tempDir();
    const output = tempDir();
    const source = join(sourceDir, 'book.md');
    writeFileSync(source, MARKDOWN, 'utf8');
    const code = await run([
      '--source',
      source,
      '--output',
      output,
      '--proofread',
      '--dry-run',
      '--proofread-strict',
    ]);
    expect(code).toBe(1);
  });
});

describe('stage-aware --dry-run selection', () => {
  it('writes both proofread and chapter dry-run artifacts when chapter extraction is selected', async () => {
    const sourceDir = tempDir();
    const output = tempDir();
    const source = join(sourceDir, 'book.md');
    writeFileSync(source, MARKDOWN, 'utf8');
    const previousKey = process.env.LLM_API_KEY;
    process.env.LLM_API_KEY = 'test-key';
    try {
      const code = await run([
        '--source',
        source,
        '--output',
        output,
        '--proofread',
        '--llm',
        '--dry-run',
      ]);
      expect(code).toBe(0);
      const root = join(output, 'book');
      expect(existsSync(join(root, 'review', 'proofread', 'dry-run.json'))).toBe(true);
      expect(existsSync(join(root, 'review', 'run-report.json'))).toBe(true);
    } finally {
      if (previousKey === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = previousKey;
    }
  });
});
