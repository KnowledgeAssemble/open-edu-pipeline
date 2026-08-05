import { describe, it, expect, beforeEach } from 'vitest';
import { ExtractorRouter } from '../router.js';
import type { Extractor } from '../interface.js';
import type { ExtractionInput } from '../types.js';

function makeFakeExtractor(id: string, extensions: string[]): Extractor {
  return {
    id,
    supportedExtensions: extensions,
    canHandle: (input) => extensions.some((ext) => input.filePath.endsWith(ext)),
    extract: async () => ({
      contentMd: `# ${id} output`,
      manifest: {
        id: 'test',
        sourceType: 'test',
        extractor: id,
        version: '1.0.0',
        pages: 1,
        images: 0,
        tables: 0,
        warnings: [],
        createdAt: new Date().toISOString(),
        complexity: 'low' as const,
      },
      assets: [],
    }),
  };
}

describe('ExtractorRouter', () => {
  let router: ExtractorRouter;

  beforeEach(() => {
    router = new ExtractorRouter();
  });

  it('registers and retrieves extractors by extension', () => {
    const pdfExtractor = makeFakeExtractor('pdf-ext', ['.pdf']);
    router.register(pdfExtractor);

    const input: ExtractionInput = { filePath: '/tmp/test.pdf' };
    const extractor = router.resolve(input)!;
    expect(extractor.id).toBe('pdf-ext');
  });

  it('returns null for unregistered extensions', () => {
    const input: ExtractionInput = { filePath: '/tmp/test.xyz' };
    const extractor = router.resolve(input);
    expect(extractor).toBeNull();
  });

  it('prefers extractorId override when set', () => {
    const defaultExt = makeFakeExtractor('default', ['.pdf']);
    const customExt = makeFakeExtractor('custom', ['.pdf']);
    router.register(defaultExt);
    router.register(customExt);

    const input: ExtractionInput = { filePath: '/tmp/test.pdf', extractorId: 'custom' };
    const extractor = router.resolve(input);
    expect(extractor!.id).toBe('custom');
  });

  it('lists registered extractor IDs', () => {
    router.register(makeFakeExtractor('a', ['.pdf']));
    router.register(makeFakeExtractor('b', ['.docx']));
    expect(router.listExtractors()).toEqual(['a', 'b']);
  });

  it('clears all extractors', () => {
    router.register(makeFakeExtractor('a', ['.pdf']));
    router.clear();
    expect(router.listExtractors()).toEqual([]);
  });

  it('routes .docx to correct extractor', () => {
    router.register(makeFakeExtractor('docx-ext', ['.docx']));
    const input: ExtractionInput = { filePath: '/tmp/report.docx' };
    expect(router.resolve(input)!.id).toBe('docx-ext');
  });

  it('routes .pptx to correct extractor', () => {
    router.register(makeFakeExtractor('pptx-ext', ['.pptx']));
    const input: ExtractionInput = { filePath: '/tmp/slides.pptx' };
    expect(router.resolve(input)!.id).toBe('pptx-ext');
  });

  it('routes image extensions to OCR extractor', () => {
    router.register(makeFakeExtractor('ocr', ['.png', '.jpg', '.jpeg', '.webp']));
    expect(router.resolve({ filePath: '/tmp/img.png' })!.id).toBe('ocr');
    expect(router.resolve({ filePath: '/tmp/img.jpg' })!.id).toBe('ocr');
  });

  it('routes .zip recursively (handled at orchestration layer)', () => {
    router.register(makeFakeExtractor('zip', ['.zip']));
    const input: ExtractionInput = { filePath: '/tmp/archive.zip' };
    expect(router.resolve(input)!.id).toBe('zip');
  });
});
