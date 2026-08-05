import { describe, it, expect } from 'vitest';
import { renderSvg, isAllowedRendererType } from '../svg.js';

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-1',
    filename: 'test.svg',
    mediaType: 'image/svg+xml' as const,
    altText: 'Test SVG',
    caption: 'A test SVG',
    rendererType: 'place-value-chart',
    conceptIds: ['test_concept'],
    sourceUnitIds: ['src-1'],
    parameters: { maxPlaces: 4, number: 3526 },
    ...overrides,
  } as any;
}

describe('renderSvg', () => {
  it('produces valid SVG with title and desc', () => {
    const svg = renderSvg(makeEntry());
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<title>');
    expect(svg).toContain('</title>');
    expect(svg).toContain('<desc>');
    expect(svg).toContain('</desc>');
  });

  it('produces deterministic output for same input', () => {
    const a = renderSvg(makeEntry());
    const b = renderSvg(makeEntry());
    expect(a).toBe(b);
  });

  it('escapes HTML in alt text', () => {
    const svg = renderSvg(makeEntry({ altText: '<script>alert("xss")</script>' }));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('renders number-line with ticks', () => {
    const svg = renderSvg(
      makeEntry({ rendererType: 'number-line', parameters: { min: 0, max: 10 } }),
    );
    expect(svg).toContain('<line');
    expect(svg).toContain('0');
    expect(svg).toContain('10');
  });

  it('renders fraction-bar with divisions', () => {
    const svg = renderSvg(
      makeEntry({ rendererType: 'fraction-bar', parameters: { numerator: 1, denominator: 4 } }),
    );
    expect(svg).toContain('1/4');
  });

  it('renders fraction-circle with path', () => {
    const svg = renderSvg(
      makeEntry({ rendererType: 'fraction-circle', parameters: { numerator: 2, denominator: 4 } }),
    );
    expect(svg).toContain('<path');
    expect(svg).toContain('2/4');
  });

  it('renders decimal-grid with cells', () => {
    const svg = renderSvg(
      makeEntry({
        rendererType: 'decimal-grid',
        parameters: { whole: 0, tenths: 3, hundredths: 5 },
      }),
    );
    expect(svg).toContain('0.35');
  });

  it('renders measurement-scale', () => {
    const svg = renderSvg(
      makeEntry({
        rendererType: 'measurement-scale',
        parameters: { min: 0, max: 5, step: 1, unit: 'cm' },
      }),
    );
    expect(svg).toContain('cm');
  });

  it('renders area-grid with cells', () => {
    const svg = renderSvg(
      makeEntry({ rendererType: 'area-grid', parameters: { rows: 3, cols: 4 } }),
    );
    expect(svg).toContain('<rect');
  });

  it('renders geometry-basic shapes', () => {
    const square = renderSvg(
      makeEntry({ rendererType: 'geometry-basic', parameters: { type: 'square', side: 100 } }),
    );
    expect(square).toContain('<rect');

    const circle = renderSvg(
      makeEntry({ rendererType: 'geometry-basic', parameters: { type: 'circle', radius: 60 } }),
    );
    expect(circle).toContain('<circle');
  });

  it('renders bar-chart', () => {
    const svg = renderSvg(
      makeEntry({
        rendererType: 'bar-chart',
        parameters: { labels: ['A', 'B'], values: [10, 20] },
      }),
    );
    expect(svg).toContain('A');
    expect(svg).toContain('B');
  });

  it('renders pictograph', () => {
    const svg = renderSvg(
      makeEntry({ rendererType: 'pictograph', parameters: { labels: ['X', 'Y'], values: [3, 5] } }),
    );
    expect(svg).toContain('X');
    expect(svg).toContain('Y');
  });

  it('isAllowedRendererType validates', () => {
    expect(isAllowedRendererType('place-value-chart')).toBe(true);
    expect(isAllowedRendererType('unknown')).toBe(false);
  });

  it('throws for unknown renderer type', () => {
    expect(() => renderSvg(makeEntry({ rendererType: 'unknown' }))).toThrow('Unknown renderer');
  });
});
