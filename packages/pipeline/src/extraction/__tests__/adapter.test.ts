import { describe, it, expect } from 'vitest';
import { toPageContent } from '../adapter.js';
import type { ExtractionResult } from '../types.js';

function makeResult(contentMd: string, pageCount: number = 5): ExtractionResult {
  return {
    contentMd,
    manifest: {
      id: 'test',
      sourceType: 'pdf',
      extractor: 'liteparse',
      version: '1.0.0',
      pages: pageCount,
      images: 0,
      tables: 0,
      warnings: [],
      createdAt: new Date().toISOString(),
      complexity: 'low',
    },
    assets: [],
  };
}

describe('toPageContent adapter', () => {
  it('splits markdown by form-feed into pages', () => {
    const result = makeResult('Page 1 content\n\fPage 2 content\n\fPage 3 content');
    const pages = toPageContent(result);
    expect(pages).toHaveLength(3);
    expect(pages[0]!.pageNum).toBe(1);
    expect(pages[0]!.text).toBe('Page 1 content');
    expect(pages[2]!.pageNum).toBe(3);
  });

  it('splits by double newline when no form-feed', () => {
    const result = makeResult('Paragraph one\n\nParagraph two\n\nParagraph three');
    const pages = toPageContent(result);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]!.pageNum).toBeDefined();
  });

  it('creates single page for short content', () => {
    const result = makeResult('Just a short doc');
    const pages = toPageContent(result);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.pageNum).toBe(1);
  });

  it('skips empty pages', () => {
    const result = makeResult('Page 1\n\f\n\fPage 3');
    const pages = toPageContent(result);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.text).toBe('Page 1');
    expect(pages[1]!.text).toBe('Page 3');
  });

  it('preserves text content faithfully', () => {
    const text = '# Chapter 1\n\nThis is content with **bold** and *italic*';
    const result = makeResult(text);
    const pages = toPageContent(result);
    expect(pages[0]!.text).toContain('# Chapter 1');
    expect(pages[0]!.text).toContain('**bold**');
  });
});
