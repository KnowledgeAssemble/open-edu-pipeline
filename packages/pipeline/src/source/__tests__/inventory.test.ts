import { describe, it, expect } from 'vitest';
import { SourceUnitSchema, SourceInventorySchema } from '../types.js';

describe('SourceUnitSchema', () => {
  it('validates a valid source unit', () => {
    const unit = {
      id: 'src-1',
      type: 'lesson' as const,
      text: 'Lesson 1: Numbers',
      location: { pageStart: 1 },
      extractionConfidence: 1.0,
      requiredCoverage: true,
    };
    expect(() => SourceUnitSchema.parse(unit)).not.toThrow();
  });

  it('rejects empty id', () => {
    expect(() =>
      SourceUnitSchema.parse({
        id: '',
        type: 'lesson',
        text: 'text',
        location: { pageStart: 1 },
        extractionConfidence: 1.0,
        requiredCoverage: true,
      }),
    ).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() =>
      SourceUnitSchema.parse({
        id: 'src-1',
        type: 'not_a_type',
        text: 'text',
        location: { pageStart: 1 },
        extractionConfidence: 1.0,
        requiredCoverage: true,
      }),
    ).toThrow();
  });

  it('rejects confidence > 1', () => {
    expect(() =>
      SourceUnitSchema.parse({
        id: 'src-1',
        type: 'lesson',
        text: 'text',
        location: { pageStart: 1 },
        extractionConfidence: 1.5,
        requiredCoverage: true,
      }),
    ).toThrow();
  });

  it('rejects negative page number', () => {
    expect(() =>
      SourceUnitSchema.parse({
        id: 'src-1',
        type: 'lesson',
        text: 'text',
        location: { pageStart: -1 },
        extractionConfidence: 1.0,
        requiredCoverage: true,
      }),
    ).toThrow();
  });
});

describe('SourceInventorySchema', () => {
  it('validates a complete inventory', () => {
    const inventory = {
      documentId: 'math-level-b',
      title: 'Math Level B',
      totalPages: 203,
      units: [
        {
          id: 'src-1',
          type: 'lesson' as const,
          text: 'Lesson 1',
          location: { pageStart: 1 },
          extractionConfidence: 1.0,
          requiredCoverage: true,
        },
      ],
      warnings: [],
    };
    expect(() => SourceInventorySchema.parse(inventory)).not.toThrow();
  });

  it('rejects zero pages', () => {
    expect(() =>
      SourceInventorySchema.parse({
        documentId: 'empty',
        title: 'Empty',
        totalPages: 0,
        units: [],
        warnings: [],
      }),
    ).toThrow();
  });
});
