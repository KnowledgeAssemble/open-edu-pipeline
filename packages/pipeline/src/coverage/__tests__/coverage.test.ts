import { describe, it, expect } from 'vitest';
import { buildCoverageLedger } from '../index.js';

describe('buildCoverageLedger', () => {
  const sourceUnits = [
    {
      id: 'src-1',
      type: 'lesson' as const,
      text: 'Lesson 1',
      location: { pageStart: 1 },
      extractionConfidence: 1.0,
      requiredCoverage: true,
    },
    {
      id: 'src-2',
      type: 'objective' as const,
      text: 'Objectives',
      location: { pageStart: 1 },
      extractionConfidence: 0.95,
      requiredCoverage: true,
    },
    {
      id: 'src-3',
      type: 'review' as const,
      text: 'Review',
      location: { pageStart: 10 },
      extractionConfidence: 0.9,
      requiredCoverage: false,
    },
  ];

  const concepts = [
    {
      conceptId: 'c1',
      label: 'C1',
      kind: 'knowledge' as const,
      sourceUnitIds: ['src-1', 'src-2'],
      learningObjective: 'Learn concept 1',
      coreIdea: 'Core idea of concept 1 with enough detail',
      difficulty: 'beginner' as const,
      masteryThreshold: 0.8,
      prerequisites: [],
      representations: ['visual' as const],
      exerciseFamilies: ['ex'],
      misconceptionTargets: [],
      recommendedWidgetCategories: [],
      estimatedMinutes: 10,
    },
  ];

  it('returns 100% coverage when all required are covered', () => {
    const activityMap = new Map<string, string[]>();
    activityMap.set('c1', ['act-1']);
    const ledger = buildCoverageLedger(sourceUnits, concepts, [], [], activityMap);
    expect(ledger.summary.percentRequiredCovered).toBe(100);
  });

  it('marks non-required as not_applicable', () => {
    const activityMap = new Map<string, string[]>();
    activityMap.set('c1', ['act-1']);
    const ledger = buildCoverageLedger(sourceUnits, concepts, [], [], activityMap);
    const reviewEntry = ledger.entries.find((e) => e.sourceUnitId === 'src-3');
    expect(reviewEntry?.status).toBe('not_applicable');
  });

  it('returns 0% when nothing is covered', () => {
    const ledger = buildCoverageLedger(sourceUnits, [], [], [], new Map());
    const lessonEntry = ledger.entries.find((e) => e.sourceUnitId === 'src-1');
    expect(lessonEntry?.status).toBe('uncovered');
  });
});
