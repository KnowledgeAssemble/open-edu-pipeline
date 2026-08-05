import { describe, it, expect } from 'vitest';
import { runExtraction, createDefaultRouter } from '../index.js';
import type { ExtractionInput } from '../types.js';

describe('createDefaultRouter', () => {
  it('creates router with built-in extractors', () => {
    const router = createDefaultRouter();
    const ids = router.listExtractors();
    expect(ids).toContain('liteparse');
  });
});

describe('runExtraction', () => {
  it('extracts a markdown file using default router', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const tmpFile = path.join('/tmp', `integ-test-${Date.now()}.md`);
    fs.writeFileSync(
      tmpFile,
      '# Chapter 1\n\nContent\n\n![Image](img.png)\n\n| A | B |\n|---|---|\n| 1 | 2 |',
    );

    const input: ExtractionInput = { filePath: tmpFile };
    const result = await runExtraction(input);
    expect(result.contentMd).toBeTruthy();
    expect(result.manifest.extractor).toBe('liteparse');
    expect(result.manifest.sourceType).toBe('markdown');

    fs.unlinkSync(tmpFile);
  });

  it('adapter converts result to PageContent[]', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const tmpFile = path.join('/tmp', `integ-adapter-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, '# Chapter 1\n\nContent\n\nMore content');

    const input: ExtractionInput = { filePath: tmpFile };
    const result = await runExtraction(input);
    const { toPageContent } = await import('../adapter.js');
    const pages = toPageContent(result);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]!.pageNum).toBe(1);

    fs.unlinkSync(tmpFile);
  });

  it('rejects empty filePath', async () => {
    await expect(runExtraction({ filePath: '' })).rejects.toThrow();
  });

  it('throws error for unsupported file type', async () => {
    await expect(runExtraction({ filePath: '/tmp/test.unsupported' })).rejects.toThrow(
      /No extractor found/,
    );
  });
});
