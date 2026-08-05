import { describe, it, expect } from 'vitest';
import { validateConceptPair, validateAll } from '../index.js';
import type { ConceptActivityPair } from '../../types.js';
import { makeConcept, makeActivity } from '../../test-helpers.js';

function makeQuizActivity() {
  return makeActivity('mastery_check', 4, {
    courseSpecType: 'quiz' as const,
    content: {
      description: 'Quiz',
      questions: [{ question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0 }],
    },
  });
}

describe('validateConceptPair', () => {
  it('passes valid concept with all 5 activities', () => {
    const concept = makeConcept();
    const activities = [
      makeActivity('observe', 1),
      makeActivity('guided_practice', 2),
      makeActivity('independent_practice', 3),
      makeQuizActivity(),
      makeActivity('positive_completion', 5),
    ];
    const result = validateConceptPair(concept, activities);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid conceptId format', () => {
    const concept = makeConcept({ conceptId: 'Invalid-ID' });
    const result = validateConceptPair(concept, []);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain('Invalid conceptId format');
  });

  it('rejects short learning objective', () => {
    const concept = makeConcept({ learningObjective: 'Short' });
    const result = validateConceptPair(concept, []);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain('learningObjective');
  });

  it('rejects missing core idea', () => {
    const concept = makeConcept({ coreIdea: '' });
    const result = validateConceptPair(concept, []);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain('coreIdea');
  });

  it('rejects missing examples', () => {
    const concept = makeConcept({ examples: [] });
    const result = validateConceptPair(concept, []);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain('example');
  });

  it('rejects missing activities', () => {
    const concept = makeConcept();
    const result = validateConceptPair(concept, []);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes('5 activities'))).toBe(true);
  });

  it('rejects mastery_check without questions', () => {
    const concept = makeConcept();
    const activities = [
      makeActivity('observe', 1),
      makeActivity('guided_practice', 2),
      makeActivity('independent_practice', 3),
      {
        step: 'mastery_check' as const,
        courseSpecType: 'quiz' as const,
        order: 4,
        content: { description: 'Quiz' },
      },
      makeActivity('positive_completion', 5),
    ];
    const result = validateConceptPair(concept, activities);
    expect(result.errors.some((e) => e.message.includes('question'))).toBe(true);
  });
});

describe('validateAll', () => {
  it('passes valid pairs and fails invalid ones', () => {
    const validPair: ConceptActivityPair = {
      concept: makeConcept(),
      activities: [
        makeActivity('observe', 1),
        makeActivity('guided_practice', 2),
        makeActivity('independent_practice', 3),
        makeQuizActivity(),
        makeActivity('positive_completion', 5),
      ],
    };
    const invalidPair: ConceptActivityPair = {
      concept: makeConcept({ conceptId: 'Bad-ID!' }),
      activities: [],
    };

    const result = validateAll([validPair, invalidPair]);
    expect(result.passed).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
  });
});
