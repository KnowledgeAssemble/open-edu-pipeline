import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { PageComplexityStats, ParseResult, ScreenshotResult } from '@llamaindex/liteparse';
import { buildReference, routePage } from '../reference.js';

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proofread-reference-'));
  dirs.push(dir);
  return dir;
}

const complexStats: PageComplexityStats = {
  pageNumber: 2,
  textLength: 300,
  textCoverage: 0.5,
  hasSubstantialImages: true,
  imageBlockCount: 1,
  imageCoverage: 0.5,
  largestImageCoverage: 0.4,
  fullPageImage: false,
  isGarbled: false,
  pageArea: 1000,
  needsOcr: true,
  reasons: ['scanned'],
};

function parseResult(): ParseResult {
  return {
    pages: [
      {
        pageNum: 1,
        width: 600,
        height: 800,
        text: 'This is a long prose paragraph that does not need a visual reference because it is ordinary text. '.repeat(
          3,
        ),
        markdown: 'This is a long prose paragraph.',
        textItems: [],
      },
      {
        pageNum: 2,
        width: 600,
        height: 800,
        text: 'Diagram page',
        markdown: '![figure](assets/figure.png)',
        textItems: [],
        complexity: complexStats,
      },
    ],
    text: '',
    images: [],
    imageErrorCount: 0,
  } as unknown as ParseResult;
}

const screenshotResult: ScreenshotResult = {
  pageNum: 2,
  width: 600,
  height: 800,
  imageBuffer: Buffer.from('png'),
  isSolidFill: false,
  rects: [],
};

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('reference routing', () => {
  it('routes OCR, full-page images, tables, figures, images, math, and short pages to vision', () => {
    expect(routePage({ text: 'x', markdown: 'x', complexity: complexStats })).toBe('vision');
    expect(routePage({ text: 'x'.repeat(500), markdown: '![a](assets/a.png)' })).toBe('vision');
    expect(routePage({ text: 'x'.repeat(500), markdown: '$$x$$' })).toBe('vision');
    expect(routePage({ text: 'short', markdown: 'short' })).toBe('vision');
  });

  it('keeps ordinary prose on text even when it contains an incidental pipe', () => {
    const prose = 'This prose page has an inline pipe | used in a sentence. '.repeat(10);
    expect(routePage({ text: prose, markdown: prose })).toBe('text');
  });

  it('honors explicit text and vision modes', () => {
    expect(routePage({ text: 'short', markdown: 'short' }, 'text')).toBe('text');
    expect(routePage({ text: 'x'.repeat(500), markdown: 'prose' }, 'vision')).toBe('vision');
  });
});

describe('reference builder', () => {
  it('builds per-page references, screenshots vision pages, and caches by key', async () => {
    const dir = tempDir();
    const pdfPath = join(dir, 'book.pdf');
    writeFileSync(pdfPath, 'dummy-pdf');
    const cacheDir = join(dir, 'cache');
    let parseCalls = 0;
    let screenshotCalls = 0;

    const bundle = await buildReference({
      pdfPath,
      cacheDir,
      rawMarkdown: '# Book',
      dependencies: {
        liteparseVersion: 'test',
        parse: async () => {
          parseCalls += 1;
          return parseResult();
        },
        screenshot: async () => {
          screenshotCalls += 1;
          return [screenshotResult];
        },
      },
    });

    expect(bundle.pages).toHaveLength(2);
    expect(bundle.pages[0]?.kind).toBe('text');
    expect(bundle.pages[1]?.kind).toBe('vision');
    expect(bundle.pages[1]?.hasScreenshot).toBe(true);
    expect(bundle.pages[1]?.screenshotPath).toContain('2.png');
    expect(bundle.manifest.referenceMismatch).toBe(true);
    expect(parseCalls).toBe(1);
    expect(screenshotCalls).toBe(1);

    const cached = await buildReference({
      pdfPath,
      cacheDir,
      rawMarkdown: '# Book',
      dependencies: {
        liteparseVersion: 'test',
        parse: async () => {
          throw new Error('should replay from cache');
        },
        screenshot: async () => {
          throw new Error('should replay from cache');
        },
      },
    });
    expect(cached.pages).toHaveLength(2);
    expect(cached.pages[1]?.screenshotPath).toBe(bundle.pages[1]?.screenshotPath);
  });

  it('accepts known provenance and records the mismatch flag', async () => {
    const dir = tempDir();
    const pdfPath = join(dir, 'book.pdf');
    writeFileSync(pdfPath, 'dummy-pdf');
    const bundle = await buildReference({
      pdfPath,
      cacheDir: join(dir, 'cache'),
      rawMarkdown: '# Book',
      dependencies: {
        liteparseVersion: 'test',
        parse: async () => parseResult(),
        screenshot: async () => [screenshotResult],
      },
      rawProvenance: { liteparseVersion: 'test' },
    });
    expect(bundle.manifest.referenceMismatch).toBe(false);
    expect(bundle.manifest.liteparseVersion).toBe('test');
  });
});
