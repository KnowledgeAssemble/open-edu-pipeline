import { describe, it, expect } from 'vitest';
import { renderCourseSpec, renderCourseSpecJSON } from '../index.js';
import type { ConceptActivityPair, GeneratedConcept, GeneratedActivity } from '../../types.js';

function makeMockPair(overrides?: Partial<GeneratedActivity>): ConceptActivityPair {
  const concept: GeneratedConcept = {
    conceptId: 'family_types',
    chapterCode: 'CH1',
    chapterName: 'Understanding Families',
    learningObjective: 'Identify family types',
    coreIdea: 'A family is the smallest unit of society.',
    examples: ['Joint families have multiple generations'],
    misconceptions: ['All families are nuclear'],
    supports: { visual: true },
    masteryCriteria: 0.8,
    difficulty: 'beginner',
    estimatedDuration: 15,
    dependencies: [],
  };

  const defaultActivity: GeneratedActivity = {
    step: 'observe',
    courseSpecType: 'widget',
    order: 1,
    content: {
      description: 'Family Matching',
      instructions: 'Match each family type to its description.',
      widgetConfig: { pairs: [{ itemA: 'Joint', itemB: 'Multiple generations' }] },
    },
    widgetId: 'open-edu.matching',
    widgetConfig: { pairs: [{ itemA: 'Joint', itemB: 'Multiple generations' }] },
  };

  return {
    concept,
    activities: [{ ...defaultActivity, ...overrides }],
  };
}

describe('pipeline output integration', () => {
  it('generates markdown with widget badge for widget activities', () => {
    const pair = makeMockPair();
    const md = renderCourseSpec([pair]);
    expect(md).toContain('Activity:');
    expect(md).toContain('[Widget]');
    // Raw JSON should not appear in markdown
    expect(md).not.toContain('"widgetId"');
    expect(md).not.toContain('"widgetConfig"');
  });

  it('generates JSON with preserved widget config', () => {
    const pair = makeMockPair();
    const json = renderCourseSpecJSON([pair]);
    expect(json.lessons).toHaveLength(1);
    expect(json.lessons[0]!.activities).toHaveLength(1);
    expect(json.lessons[0]!.activities[0]!.widgetId).toBe('open-edu.matching');
    expect(json.lessons[0]!.activities[0]!.widgetConfig).toBeDefined();
    expect(json.lessons[0]!.activities[0]!.type).toBe('widget');
  });

  it('handles mixed activity types in JSON output', () => {
    const pair = makeMockPair();
    pair.activities.push({
      step: 'guided_practice',
      courseSpecType: 'reading',
      order: 2,
      content: {
        description: 'Read about families',
        instructions: 'Read this text about different family structures.',
      },
    });
    pair.activities.push({
      step: 'mastery_check',
      courseSpecType: 'quiz',
      order: 3,
      content: {
        description: 'Quiz',
        questions: [
          { question: 'What is a family?', options: ['A', 'B', 'C', 'D'], correctIndex: 0 },
        ],
      },
    });

    const json = renderCourseSpecJSON([pair]);
    expect(json.lessons[0]!.activities).toHaveLength(3);
    expect(json.lessons[0]!.activities[0]!.type).toBe('widget');
    expect(json.lessons[0]!.activities[1]!.type).toBe('reading');
    expect(json.lessons[0]!.activities[2]!.type).toBe('quiz');
  });

  it('includes format and version in JSON output', () => {
    const pair = makeMockPair();
    const json = renderCourseSpecJSON([pair]);
    expect(json.format).toBe('openedu-course-spec');
    expect(json.version).toBe(1);
    expect(json.generatedAt).toBeDefined();
  });

  it('handles multiple concepts', () => {
    const pair1 = makeMockPair();
    const pair2 = makeMockPair({
      step: 'observe',
      courseSpecType: 'reading',
      order: 1,
      content: { description: 'Reading Activity', instructions: 'Read this.' },
      widgetId: undefined,
      widgetConfig: undefined,
    });

    const json = renderCourseSpecJSON([pair1, pair2]);
    expect(json.lessons).toHaveLength(2);
    expect(json.lessons[0]!.id).toBe('lesson-101');
    expect(json.lessons[1]!.id).toBe('lesson-102');
  });
});
