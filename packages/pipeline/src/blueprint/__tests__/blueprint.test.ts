import { describe, it, expect } from 'vitest';
import { LessonBlueprintSchema, validateBlueprint } from '../types.js';
import type { LessonBlueprint } from '../types.js';

function makeValidBlueprint(overrides: Partial<LessonBlueprint> = {}): LessonBlueprint {
  return {
    conceptId: 'indian_place_value',
    sourceUnitIds: ['src-5', 'src-6'],
    objective: 'Identify place values up to crores using the Indian numbering system',
    priorKnowledge: ['counting_1_100'],
    representations: ['visual', 'symbolic'],
    lessonArc: [
      { step: 'hook', description: 'Hook', durationMinutes: 3 },
      { step: 'observe', description: 'Observe', durationMinutes: 5 },
      { step: 'worked_example', description: 'Example', durationMinutes: 5 },
      { step: 'guided_practice', description: 'Practice', durationMinutes: 7 },
      { step: 'widget_practice', description: 'Widget', durationMinutes: 5 },
      { step: 'independent_practice', description: 'Independent', durationMinutes: 8 },
      { step: 'mastery_check', description: 'Quiz', durationMinutes: 5 },
      { step: 'remediation', description: 'Review', durationMinutes: 5 },
      { step: 'extension', description: 'Extend', durationMinutes: 7 },
    ],
    assetRequests: [
      {
        id: 'chart-1',
        rendererType: 'place-value-chart',
        parameters: { maxPlaces: 7, number: 352648 },
        description: 'Place value chart',
      },
    ],
    widgetRequests: [
      {
        step: 'widget_practice',
        widgetCategory: 'place-value',
        mode: 'interactive',
        description: 'Place value widget',
      },
    ],
    questionFamilies: ['place_value_identification', 'expanded_form'],
    misconceptionTargets: ['Confusing lakhs with millions'],
    ...overrides,
  };
}

describe('LessonBlueprintSchema', () => {
  it('validates a valid blueprint', () => {
    expect(() => LessonBlueprintSchema.parse(makeValidBlueprint())).not.toThrow();
  });

  it('rejects empty sourceUnitIds', () => {
    expect(() => LessonBlueprintSchema.parse(makeValidBlueprint({ sourceUnitIds: [] }))).toThrow();
  });

  it('rejects short objective', () => {
    expect(() => LessonBlueprintSchema.parse(makeValidBlueprint({ objective: 'Learn' }))).toThrow();
  });

  it('rejects empty representations', () => {
    expect(() =>
      LessonBlueprintSchema.parse(makeValidBlueprint({ representations: [] })),
    ).toThrow();
  });

  it('rejects less than 2 arc steps', () => {
    expect(() =>
      LessonBlueprintSchema.parse(
        makeValidBlueprint({
          lessonArc: [{ step: 'mastery_check', description: 'Quiz', durationMinutes: 5 }],
        }),
      ),
    ).toThrow();
  });
});

describe('validateBlueprint', () => {
  it('returns no errors for valid blueprint', () => {
    expect(validateBlueprint(makeValidBlueprint())).toEqual([]);
  });

  it('detects no mastery check', () => {
    const bp = makeValidBlueprint({
      lessonArc: [
        { step: 'observe', description: 'O', durationMinutes: 10 },
        { step: 'independent_practice', description: 'IP', durationMinutes: 10 },
      ],
    });
    expect(validateBlueprint(bp).some((e) => e.includes('no mastery_check'))).toBe(true);
  });

  it('detects visual concept with no assets', () => {
    const bp = makeValidBlueprint({ assetRequests: [], representations: ['visual'] });
    expect(validateBlueprint(bp).some((e) => e.includes('visual') && e.includes('no asset'))).toBe(
      true,
    );
  });
});
