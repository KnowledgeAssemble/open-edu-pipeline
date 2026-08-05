import { describe, it, expect } from 'vitest';
import {
  ExtractionInputSchema,
  ExtractionResultSchema,
  ExtractionManifestSchema,
  ExtractionErrorSchema,
  AssetInfoSchema,
} from '../types.js';

describe('ExtractionInputSchema', () => {
  it('validates a valid PDF input', () => {
    const input = { filePath: '/tmp/test.pdf', mimeType: 'application/pdf' };
    expect(() => ExtractionInputSchema.parse(input)).not.toThrow();
  });

  it('validates input without mimeType (auto-detect)', () => {
    const input = { filePath: '/tmp/test.docx' };
    expect(() => ExtractionInputSchema.parse(input)).not.toThrow();
  });

  it('rejects empty filePath', () => {
    expect(() => ExtractionInputSchema.parse({ filePath: '' })).toThrow();
  });

  it('accepts optional extractor override', () => {
    const input = { filePath: '/tmp/test.pdf', extractorId: 'custom-pdf' };
    expect(() => ExtractionInputSchema.parse(input)).not.toThrow();
  });

  it('accepts optional options', () => {
    const input = { filePath: '/tmp/test.pdf', options: { extractImages: false } };
    expect(() => ExtractionInputSchema.parse(input)).not.toThrow();
  });
});

describe('ExtractionResultSchema', () => {
  it('validates a complete result', () => {
    const result = {
      contentMd: '# Title\n\nBody text',
      manifest: {
        id: 'test-123',
        sourceType: 'pdf',
        extractor: 'liteparse',
        version: '1.0.0',
        pages: 10,
        images: 2,
        tables: 1,
        warnings: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        complexity: 'low',
      },
      assets: [
        {
          filename: 'image-001.png',
          originalName: 'img.png',
          mediaType: 'image/png',
          sizeBytes: 1024,
        },
      ],
    };
    expect(() => ExtractionResultSchema.parse(result)).not.toThrow();
  });

  it('rejects empty contentMd', () => {
    const result = {
      contentMd: '',
      manifest: {
        id: 'x',
        sourceType: 'pdf',
        extractor: 'liteparse',
        version: '1.0.0',
        pages: 1,
        images: 0,
        tables: 0,
        warnings: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        complexity: 'low',
      },
      assets: [],
    };
    expect(() => ExtractionResultSchema.parse(result)).toThrow();
  });

  it('validates result with no assets', () => {
    const result = {
      contentMd: '# Just text',
      manifest: {
        id: 'x',
        sourceType: 'markdown',
        extractor: 'liteparse',
        version: '1.0.0',
        pages: 1,
        images: 0,
        tables: 0,
        warnings: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        complexity: 'low',
      },
      assets: [],
    };
    expect(() => ExtractionResultSchema.parse(result)).not.toThrow();
  });
});

describe('ExtractionManifestSchema', () => {
  it('validates a complete manifest', () => {
    const manifest = {
      id: 'abc-123',
      sourceType: 'pdf',
      extractor: 'liteparse',
      version: '1.0.0',
      pages: 42,
      images: 5,
      tables: 2,
      warnings: ['Low OCR confidence on page 3'],
      createdAt: '2026-07-27T00:00:00.000Z',
      complexity: 'medium',
    };
    expect(() => ExtractionManifestSchema.parse(manifest)).not.toThrow();
  });

  it('rejects invalid complexity', () => {
    const manifest = {
      id: 'x',
      sourceType: 'pdf',
      extractor: 'liteparse',
      version: '1.0.0',
      pages: 1,
      images: 0,
      tables: 0,
      warnings: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      complexity: 'very-high',
    };
    expect(() => ExtractionManifestSchema.parse(manifest)).toThrow();
  });
});

describe('ExtractionErrorSchema', () => {
  it('validates a recoverable error', () => {
    const error = { code: 'EXTRACTION_FAILED', message: 'Parse error', recoverable: true };
    expect(() => ExtractionErrorSchema.parse(error)).not.toThrow();
  });

  it('validates a non-recoverable error', () => {
    const error = { code: 'UNSUPPORTED_FORMAT', message: 'Cannot handle .xyz', recoverable: false };
    expect(() => ExtractionErrorSchema.parse(error)).not.toThrow();
  });
});

describe('AssetInfoSchema', () => {
  it('validates asset info', () => {
    const asset = {
      filename: 'image-001.png',
      originalName: 'screenshot.png',
      mediaType: 'image/png',
      sizeBytes: 2048,
    };
    expect(() => AssetInfoSchema.parse(asset)).not.toThrow();
  });

  it('accepts zero sizeBytes (unknown size)', () => {
    const asset = {
      filename: 'img.png',
      originalName: 'img.png',
      mediaType: 'image/png',
      sizeBytes: 0,
    };
    expect(() => AssetInfoSchema.parse(asset)).not.toThrow();
  });
});
