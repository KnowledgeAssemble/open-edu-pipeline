import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiteParseExtractor } from '../liteparse-extractor.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('LiteParseExtractor', () => {
  let extractor: LiteParseExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    extractor = new LiteParseExtractor();
  });

  it('has correct id and supported extensions', () => {
    expect(extractor.id).toBe('liteparse');
    expect(extractor.supportedExtensions).toContain('.pdf');
    expect(extractor.supportedExtensions).toContain('.docx');
    expect(extractor.supportedExtensions).toContain('.pptx');
    expect(extractor.supportedExtensions).toContain('.png');
    expect(extractor.supportedExtensions).toContain('.jpg');
    expect(extractor.supportedExtensions).toContain('.md');
    expect(extractor.supportedExtensions).toContain('.xlsx');
  });

  it('canHandle returns true for PDF', () => {
    expect(extractor.canHandle({ filePath: '/tmp/test.pdf' })).toBe(true);
  });

  it('canHandle returns true for DOCX', () => {
    expect(extractor.canHandle({ filePath: '/tmp/test.docx' })).toBe(true);
  });

  it('canHandle returns true for images (native LiteParse support)', () => {
    expect(extractor.canHandle({ filePath: '/tmp/test.png' })).toBe(true);
    expect(extractor.canHandle({ filePath: '/tmp/test.jpg' })).toBe(true);
    expect(extractor.canHandle({ filePath: '/tmp/test.webp' })).toBe(true);
  });

  it('canHandle returns true for XLSX', () => {
    expect(extractor.canHandle({ filePath: '/tmp/data.xlsx' })).toBe(true);
  });

  it('extracts PDF via lit parse and produces valid result', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        '# Chapter 1\n\nSome text content\n\n![Diagram](img_p1_1.png)\n\n| A | B |\n|---|---|\n| 1 | 2 |',
      )
      .mockReturnValueOnce(JSON.stringify([{ page_number: 1, needs_ocr: false, reasons: [] }]));

    const result = await extractor.extract({ filePath: '/tmp/test.pdf' });
    expect(result.contentMd).toBeTruthy();
    expect(result.manifest.extractor).toBe('liteparse');
    expect(result.manifest.sourceType).toBe('pdf');
    expect(result.manifest.complexity).toMatch(/^(low|medium|high)$/);
  });

  it('extracts DOCX via lit parse (converts through LibreOffice)', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockReturnValueOnce('# DOCX Title\n\nDOCX content here')
      .mockReturnValueOnce(JSON.stringify([{ page_number: 1, needs_ocr: false, reasons: [] }]));

    const result = await extractor.extract({ filePath: '/tmp/test.docx' });
    expect(result.contentMd).toContain('DOCX Title');
    expect(result.manifest.sourceType).toBe('docx');
  });

  it('extracts images via lit parse (native OCR)', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockReturnValueOnce('Scanned text from image via Tesseract')
      .mockReturnValueOnce(
        JSON.stringify([{ page_number: 1, needs_ocr: true, reasons: ['scanned'] }]),
      );

    const result = await extractor.extract({ filePath: '/tmp/scan.png' });
    expect(result.contentMd).toContain('Scanned text');
    expect(result.manifest.sourceType).toBe('image');
  });

  it('extracts markdown files directly (no lit parse needed)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const tmpFile = path.join('/tmp', `test-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, '# Hello\n\nWorld');

    const result = await extractor.extract({ filePath: tmpFile });
    expect(result.contentMd).toContain('# Hello');
    expect(result.manifest.sourceType).toBe('markdown');
    expect(result.manifest.pages).toBe(1);

    fs.unlinkSync(tmpFile);
  });

  it('uses complexity data from lit is-complex', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockReturnValueOnce('Simple content')
      .mockReturnValueOnce(
        JSON.stringify([
          { page_number: 1, needs_ocr: false, reasons: [] },
          { page_number: 2, needs_ocr: true, reasons: ['scanned'] },
        ]),
      );

    const result = await extractor.extract({ filePath: '/tmp/mixed.pdf' });
    expect(result.manifest.complexity).toBe('high');
  });

  it('configures OCR server URL when provided', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockReturnValueOnce('OCR text')
      .mockReturnValueOnce(
        JSON.stringify([{ page_number: 1, needs_ocr: true, reasons: ['scanned'] }]),
      );

    await extractor.extract({
      filePath: '/tmp/scan.pdf',
      options: { ocrServerUrl: 'http://localhost:8080' },
    });

    const ocrCall = vi
      .mocked(execFileSync)
      .mock.calls.find(
        (call) =>
          call[0] === 'lit' && Array.isArray(call[1]) && call[1].includes('--ocr-server-url'),
      );
    expect(ocrCall).toBeTruthy();
  });

  it('extracts images to disk when extractImages option is true', async () => {
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync)
      .mockReturnValueOnce('# Doc\n\n![Chart](img_p1_1.png)')
      .mockReturnValueOnce(JSON.stringify([{ page_number: 1, needs_ocr: false, reasons: [] }]));

    await extractor.extract({
      filePath: '/tmp/test.pdf',
      options: { extractImages: true },
    });

    const extractCall = vi
      .mocked(execFileSync)
      .mock.calls.find(
        (call) =>
          call[0] === 'lit' && Array.isArray(call[1]) && call[1].includes('--extract-images'),
      );
    expect(extractCall).toBeTruthy();
  });
});
