import type { AssetManifestEntry } from './types.js';
import { renderSvg } from './svg.js';

export interface AssetRenderer {
  type: string;
  mediaType: string;
  render(entry: AssetManifestEntry): string | Uint8Array;
  validate(parameters: Record<string, unknown>): string[];
}

const renderers = new Map<string, AssetRenderer>();

export function registerRenderer(renderer: AssetRenderer): void {
  if (renderers.has(renderer.type)) {
    throw new Error(`Asset renderer "${renderer.type}" is already registered`);
  }
  renderers.set(renderer.type, renderer);
}

export function getRenderer(type: string): AssetRenderer | undefined {
  return renderers.get(type);
}

export function listRenderers(): AssetRenderer[] {
  return [...renderers.values()];
}

export function getRenderersForProfile(allowedTypes: string[]): AssetRenderer[] {
  return allowedTypes.map((t) => renderers.get(t)).filter(Boolean) as AssetRenderer[];
}

export function clearRendererRegistry(): void {
  renderers.clear();
}

export function registerBuiltinRenderers(): void {
  registerRenderer({
    type: 'place-value-chart',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (typeof (params as any).maxPlaces !== 'number') errors.push('maxPlaces must be a number');
      return errors;
    },
  });
  registerRenderer({
    type: 'number-line',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (typeof (params as any).min !== 'number') errors.push('min must be a number');
      if (typeof (params as any).max !== 'number') errors.push('max must be a number');
      return errors;
    },
  });
  registerRenderer({
    type: 'fraction-bar',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (typeof (params as any).numerator !== 'number') errors.push('numerator must be a number');
      if (typeof (params as any).denominator !== 'number')
        errors.push('denominator must be a number');
      return errors;
    },
  });
  registerRenderer({
    type: 'fraction-circle',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (typeof (params as any).numerator !== 'number') errors.push('numerator must be a number');
      if (typeof (params as any).denominator !== 'number')
        errors.push('denominator must be a number');
      return errors;
    },
  });
  registerRenderer({
    type: 'decimal-grid',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (typeof (params as any).whole !== 'number') errors.push('whole must be a number');
      return errors;
    },
  });
  registerRenderer({
    type: 'measurement-scale',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (typeof (params as any).min !== 'number') errors.push('min must be a number');
      if (typeof (params as any).max !== 'number') errors.push('max must be a number');
      if (typeof (params as any).step !== 'number') errors.push('step must be a number');
      return errors;
    },
  });
  registerRenderer({
    type: 'area-grid',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (typeof (params as any).rows !== 'number') errors.push('rows must be a number');
      if (typeof (params as any).cols !== 'number') errors.push('cols must be a number');
      return errors;
    },
  });
  registerRenderer({
    type: 'perimeter-grid',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (typeof (params as any).rows !== 'number') errors.push('rows must be a number');
      if (typeof (params as any).cols !== 'number') errors.push('cols must be a number');
      return errors;
    },
  });
  registerRenderer({
    type: 'geometry-basic',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (_params) => {
      return [];
    },
  });
  registerRenderer({
    type: 'bar-chart',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (!Array.isArray((params as any).labels)) errors.push('labels must be an array');
      if (!Array.isArray((params as any).values)) errors.push('values must be an array');
      return errors;
    },
  });
  registerRenderer({
    type: 'pictograph',
    mediaType: 'image/svg+xml',
    render: (entry) => renderSvg(entry),
    validate: (params) => {
      const errors: string[] = [];
      if (!Array.isArray((params as any).labels)) errors.push('labels must be an array');
      if (!Array.isArray((params as any).values)) errors.push('values must be an array');
      return errors;
    },
  });
}

registerBuiltinRenderers();
