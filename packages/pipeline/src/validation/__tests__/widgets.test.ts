import { describe, it, expect } from 'vitest';
import { validateWidgetConfig } from '../widgets.js';

describe('validateWidgetConfig', () => {
  it('validates core.matching config', () => {
    const result = validateWidgetConfig('core.matching', {
      pairs: [{ itemA: 'A', itemB: 'B' }],
    });
    expect(result.valid).toBe(true);
  });

  it('validates math.fraction-visual config', () => {
    const result = validateWidgetConfig('math.fraction-visual', {
      numerator: 1,
      denominator: 4,
    });
    expect(result.valid).toBe(true);
  });

  it('validates math.place-value-chart config', () => {
    const result = validateWidgetConfig('math.place-value-chart', {
      maxPlaces: 'lakh',
      digits: [3, 5, 2, 6, 4, 8],
    });
    expect(result.valid).toBe(true);
  });

  it('validates math.number-line config', () => {
    const result = validateWidgetConfig('math.number-line', {
      min: 0,
      max: 10,
      target: 5,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects unknown widget ID', () => {
    const result = validateWidgetConfig('unknown.widget', {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Unknown');
  });

  it('rejects missing required field', () => {
    const result = validateWidgetConfig('math.fraction-visual', {
      numerator: 1,
    });
    expect(result.valid).toBe(false);
  });
});
