import { describe, it, expect } from 'vitest';
import { AssetManifestEntrySchema, AssetManifestSchema } from '../types.js';

describe('AssetManifestEntrySchema', () => {
  it('validates a valid entry', () => {
    const entry = {
      id: 'chart-1',
      filename: 'chart.svg',
      mediaType: 'image/svg+xml' as const,
      altText: 'Place value chart',
      rendererType: 'place-value-chart' as const,
      conceptIds: ['ipv'],
      sourceUnitIds: ['src-1'],
      parameters: { maxPlaces: 7 },
    };
    expect(() => AssetManifestEntrySchema.parse(entry)).not.toThrow();
  });

  it('rejects empty id', () => {
    expect(() =>
      AssetManifestEntrySchema.parse({
        id: '',
        filename: 'test.svg',
        mediaType: 'image/svg+xml',
        altText: 'test',
        rendererType: 'number-line',
        conceptIds: ['c1'],
        sourceUnitIds: [],
        parameters: {},
      }),
    ).toThrow();
  });

  it('rejects non-svg filename', () => {
    expect(() =>
      AssetManifestEntrySchema.parse({
        id: 'test',
        filename: 'test.png',
        mediaType: 'image/svg+xml',
        altText: 'test',
        rendererType: 'number-line',
        conceptIds: ['c1'],
        sourceUnitIds: [],
        parameters: {},
      }),
    ).toThrow();
  });

  it('rejects empty conceptIds', () => {
    expect(() =>
      AssetManifestEntrySchema.parse({
        id: 'test',
        filename: 'test.svg',
        mediaType: 'image/svg+xml',
        altText: 'test',
        rendererType: 'number-line',
        conceptIds: [],
        sourceUnitIds: [],
        parameters: {},
      }),
    ).toThrow();
  });
});

describe('AssetManifestSchema', () => {
  it('validates a complete manifest', () => {
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      assets: [
        {
          id: 'chart-1',
          filename: 'chart.svg',
          mediaType: 'image/svg+xml',
          altText: 'Place value chart',
          rendererType: 'place-value-chart',
          conceptIds: ['ipv'],
          sourceUnitIds: [],
          parameters: {},
        },
      ],
    };
    expect(() => AssetManifestSchema.parse(manifest)).not.toThrow();
  });
});
