import { describe, it, expect } from 'vitest';
import { ConceptRegistry } from '../concept-registry.js';

describe('ConceptRegistry', () => {
  it('initializes with known concept IDs', () => {
    const registry = new ConceptRegistry(['counting_1_10']);
    expect(registry.getAllIds()).toEqual(['counting_1_10']);
  });

  it('registers new concept IDs', () => {
    const registry = new ConceptRegistry([]);
    registry.register('addition_1_10');
    expect(registry.isKnown('addition_1_10')).toBe(true);
  });

  it('validates dependencies', () => {
    const registry = new ConceptRegistry(['counting_1_10']);
    const result = registry.validateDependencies(['counting_1_10', 'unknown_concept']);
    expect(result.valid).toEqual(['counting_1_10']);
    expect(result.missing).toEqual(['unknown_concept']);
  });

  it('reports known concepts', () => {
    const registry = new ConceptRegistry(['a', 'b']);
    expect(registry.isKnown('a')).toBe(true);
    expect(registry.isKnown('c')).toBe(false);
  });
});
