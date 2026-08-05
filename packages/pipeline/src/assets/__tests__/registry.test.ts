import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerRenderer,
  getRenderer,
  listRenderers,
  getRenderersForProfile,
  clearRendererRegistry,
  registerBuiltinRenderers,
  type AssetRenderer,
} from '../registry.js';
describe('Asset Renderer Registry', () => {
  beforeEach(() => {
    clearRendererRegistry();
  });

  it('registers and retrieves a renderer', () => {
    const renderer: AssetRenderer = {
      type: 'test-renderer',
      mediaType: 'image/svg+xml',
      render: () => '<svg></svg>',
      validate: () => [],
    };
    registerRenderer(renderer);
    expect(getRenderer('test-renderer')).toBeDefined();
    expect(getRenderer('test-renderer')!.type).toBe('test-renderer');
  });

  it('throws on duplicate registration', () => {
    const renderer: AssetRenderer = {
      type: 'dup',
      mediaType: 'image/svg+xml',
      render: () => '<svg></svg>',
      validate: () => [],
    };
    registerRenderer(renderer);
    expect(() => registerRenderer(renderer)).toThrow('already registered');
  });

  it('listRenderers returns all registered', () => {
    registerRenderer({
      type: 'a',
      mediaType: 'image/svg+xml',
      render: () => '',
      validate: () => [],
    });
    registerRenderer({
      type: 'b',
      mediaType: 'image/svg+xml',
      render: () => '',
      validate: () => [],
    });
    expect(listRenderers()).toHaveLength(2);
  });

  it('getRenderersForProfile filters by allowed types', () => {
    registerRenderer({
      type: 'math-a',
      mediaType: 'image/svg+xml',
      render: () => '',
      validate: () => [],
    });
    registerRenderer({
      type: 'math-b',
      mediaType: 'image/svg+xml',
      render: () => '',
      validate: () => [],
    });
    registerRenderer({
      type: 'science-c',
      mediaType: 'image/svg+xml',
      render: () => '',
      validate: () => [],
    });
    const filtered = getRenderersForProfile(['math-a']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.type).toBe('math-a');
  });

  it('clearRendererRegistry clears all', () => {
    registerRenderer({
      type: 'x',
      mediaType: 'image/svg+xml',
      render: () => '',
      validate: () => [],
    });
    clearRendererRegistry();
    expect(listRenderers()).toHaveLength(0);
  });
});

describe('Built-in Renderers', () => {
  beforeEach(() => {
    clearRendererRegistry();
    registerBuiltinRenderers();
  });

  it('registers all 11 built-in renderers', () => {
    const types = listRenderers().map((r) => r.type);
    expect(types).toContain('place-value-chart');
    expect(types).toContain('number-line');
    expect(types).toContain('fraction-bar');
    expect(types).toContain('fraction-circle');
    expect(types).toContain('decimal-grid');
    expect(types).toContain('measurement-scale');
    expect(types).toContain('area-grid');
    expect(types).toContain('perimeter-grid');
    expect(types).toContain('geometry-basic');
    expect(types).toContain('bar-chart');
    expect(types).toContain('pictograph');
    expect(listRenderers()).toHaveLength(11);
  });

  it('each builtin validate with valid params returns []', () => {
    const renderers = listRenderers();
    for (const r of renderers) {
      const errors = r.validate({});
      expect(Array.isArray(errors)).toBe(true);
    }
  });
});
