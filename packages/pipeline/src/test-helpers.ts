import type { GeneratedConcept, GeneratedActivity, ConceptActivityPair } from './types.js';

export function makeConcept(overrides: Partial<GeneratedConcept> = {}): GeneratedConcept {
  return {
    conceptId: 'addition_1_10',
    chapterCode: 'CH1',
    chapterName: 'Addition',
    learningObjective: 'Add two numbers with sum up to 10',
    coreIdea: 'Addition means putting groups together to find the total.',
    examples: ['2 + 1 = 3', '3 + 2 = 5'],
    misconceptions: ['Counting the starting number twice'],
    supports: { visual: true },
    masteryCriteria: 0.8,
    difficulty: 'beginner',
    estimatedDuration: 15,
    dependencies: ['counting_1_10'],
    ...overrides,
  };
}

export function makeActivity(
  step: string,
  order: number,
  overrides: Partial<GeneratedActivity> = {},
): GeneratedActivity {
  const stepToType: Record<string, string> = {
    observe: 'reading',
    guided_practice: 'exercise',
    independent_practice: 'exercise',
    mastery_check: 'quiz',
    positive_completion: 'reflection',
  };

  const base: GeneratedActivity = {
    step: step as GeneratedActivity['step'],
    courseSpecType: stepToType[step] as GeneratedActivity['courseSpecType'],
    order,
    content: { description: 'Test activity', instructions: 'Do the activity' },
    ...overrides,
  };

  if (step === 'mastery_check') {
    base.content = {
      description: 'Mastery Check',
      questions: [
        { question: 'What is 2 + 1?', options: ['2', '3', '4', '5'], correctIndex: 1 },
        { question: 'What is 3 + 2?', options: ['4', '5', '6', '7'], correctIndex: 1 },
      ],
    };
  }

  if (step === 'positive_completion') {
    base.content = {
      description: 'Great work!',
      instructions: 'You did it! Think about addition in daily life.',
    };
  }

  return base;
}

export function makeFullPair(
  conceptOverrides: Partial<GeneratedConcept> = {},
): ConceptActivityPair {
  const concept = makeConcept(conceptOverrides);
  const activities = [
    makeActivity('observe', 1),
    makeActivity('guided_practice', 2),
    makeActivity('independent_practice', 3),
    makeActivity('mastery_check', 4),
    makeActivity('positive_completion', 5),
  ];
  return { concept, activities };
}
