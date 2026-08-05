import { describe, it, expect } from 'vitest';
import { validateConceptGraph } from '../index.js';
import { ConceptSchema } from '../types.js';
import type { Concept } from '../types.js';

function makeConcept(overrides: Partial<Concept>): Concept {
  return {
    conceptId: 'test_c',
    label: 'Test',
    kind: 'knowledge',
    sourceUnitIds: ['src-1'],
    learningObjective: 'Learn the test concept thoroughly',
    coreIdea: 'This is a test concept with enough detail for validation.',
    difficulty: 'beginner',
    masteryThreshold: 0.8,
    prerequisites: [],
    representations: ['visual'],
    exerciseFamilies: ['test_ex'],
    misconceptionTargets: [],
    recommendedWidgetCategories: [],
    estimatedMinutes: 10,
    ...overrides,
  } as Concept;
}

describe('ConceptSchema', () => {
  it('validates a valid concept', () => {
    expect(() => ConceptSchema.parse(makeConcept({}))).not.toThrow();
  });

  it('rejects invalid conceptId format', () => {
    expect(() => ConceptSchema.parse(makeConcept({ conceptId: 'Bad ID' }))).toThrow();
  });

  it('rejects no source units', () => {
    expect(() => ConceptSchema.parse(makeConcept({ sourceUnitIds: [] }))).toThrow();
  });

  it('rejects short learningObjective', () => {
    expect(() => ConceptSchema.parse(makeConcept({ learningObjective: 'Learn' }))).toThrow();
  });
});

describe('validateConceptGraph', () => {
  it('returns no errors for valid acyclic graph', () => {
    const a = makeConcept({ conceptId: 'a', prerequisites: [] });
    const b = makeConcept({ conceptId: 'b', prerequisites: ['a'] });
    expect(validateConceptGraph([a, b])).toEqual([]);
  });

  it('detects self-dependency', () => {
    const a = makeConcept({ conceptId: 'a', prerequisites: ['a'] });
    expect(validateConceptGraph([a]).some((e) => e.includes('itself'))).toBe(true);
  });

  it('detects missing dependency', () => {
    const b = makeConcept({ conceptId: 'b', prerequisites: ['a'] });
    expect(validateConceptGraph([b]).some((e) => e.includes('unknown prerequisite'))).toBe(true);
  });

  it('detects cycle', () => {
    const a = makeConcept({ conceptId: 'a', prerequisites: ['b'] });
    const b = makeConcept({ conceptId: 'b', prerequisites: ['a'] });
    expect(validateConceptGraph([a, b]).some((e) => e.includes('cycle'))).toBe(true);
  });
});
