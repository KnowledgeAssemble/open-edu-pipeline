import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import type { LlmRouter, LlmStage } from '@open-edu/pipeline-llm';
import { generateConceptMap, validateConceptGraph } from '../concepts/index.js';
import { buildCoverageLedger } from '../coverage/index.js';
import { generateQualityReport } from '../validation/report.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceInventory } from '../source/types.js';
import type { CurriculumProfile } from '../profile/types.js';

const MATH_PROFILE: CurriculumProfile = {
  id: 'math',
  subject: 'mathematics',
  locale: 'en-IN',
  language: 'en',
  sourceTaxonomy: {
    lessonLabels: ['Lesson', 'Chapter'],
    sectionLabels: ['Section'],
    objectiveLabels: ['Objectives'],
    definitionLabels: ['Definition'],
    exampleLabels: ['Example'],
    exerciseLabels: ['Exercise'],
    reviewLabels: ['Review'],
    assessmentLabels: ['Assessment'],
  },
  conceptKinds: ['skill', 'knowledge', 'procedure', 'application'],
  representations: ['concrete', 'visual', 'symbolic'],
  questionFamilies: ['direct_question'],
  widgetCategories: ['core'],
  assetRendererTypes: [],
  validatorIds: [],
  promptContext: { teachingStyle: 'CPA approach' },
};

const __dirname = dirname(fileURLToPath(import.meta.url));

const fixtureInventory: SourceInventory = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'math-level-b', 'source-inventory.json'), 'utf-8'),
);

interface StageCall {
  stage: string;
  prompt: string;
}

class FakeRouter {
  public calls: StageCall[] = [];

  getStageConfig(_stage: LlmStage) {
    return { provider: 'test', model: 'test-model', maxTokens: 4096, temperature: 0.3 };
  }

  async generateStructuredRaw<T>(
    stage: LlmStage,
    prompt: string,
    _schema: z.ZodType<T>,
  ): Promise<T> {
    this.calls.push({ stage, prompt });
    if (stage === 'source_inventory') {
      return { classifications: [] } as unknown as T;
    }
    if (stage === 'concept_map') {
      return {
        concepts: [
          {
            conceptId: 'indian_place_value',
            label: 'Indian Place Value',
            kind: 'knowledge',
            sourceUnitIds: ['src-3', 'src-5'],
            learningObjective: 'Identify place values using Indian numbering system',
            coreIdea:
              'Indian numbering groups digits into ones, tens, hundreds, thousands, ten thousands, lakhs, crores.',
            difficulty: 'beginner',
            masteryThreshold: 0.8,
            prerequisites: [],
            representations: ['visual', 'symbolic'],
            exerciseFamilies: ['place_value_identification', 'expanded_form'],
            misconceptionTargets: ['Confusing lakhs with millions'],
            adultContext: 'Reading currency in lakhs and crores',
            recommendedWidgetCategories: ['place-value'],
            estimatedMinutes: 20,
          },
          {
            conceptId: 'comparison',
            label: 'Comparison of Numbers',
            kind: 'skill',
            sourceUnitIds: ['src-7', 'src-8'],
            learningObjective: 'Compare two large numbers using place value',
            coreIdea:
              'Compare digits from the leftmost place; the first different digit determines which number is larger.',
            difficulty: 'beginner',
            masteryThreshold: 0.8,
            prerequisites: ['indian_place_value'],
            representations: ['symbolic'],
            exerciseFamilies: ['comparison'],
            misconceptionTargets: ['Comparing from rightmost digit instead of leftmost'],
            recommendedWidgetCategories: ['number-line'],
            estimatedMinutes: 15,
          },
          {
            conceptId: 'ordering',
            label: 'Ordering Numbers',
            kind: 'skill',
            sourceUnitIds: ['src-10', 'src-11'],
            learningObjective: 'Arrange numbers in ascending and descending order',
            coreIdea:
              'Ordering means sorting numbers from smallest to largest (ascending) or largest to smallest (descending).',
            difficulty: 'beginner',
            masteryThreshold: 0.8,
            prerequisites: ['comparison'],
            representations: ['symbolic'],
            exerciseFamilies: ['ordering'],
            misconceptionTargets: ['Misreading large number groups'],
            recommendedWidgetCategories: ['number-line'],
            estimatedMinutes: 15,
          },
          {
            conceptId: 'expanded_form',
            label: 'Expanded Form',
            kind: 'procedure',
            sourceUnitIds: ['src-5', 'src-6'],
            learningObjective: 'Write numbers in expanded form by place value',
            coreIdea:
              'Expanded form breaks a number into the sum of each digit multiplied by its place value.',
            difficulty: 'beginner',
            masteryThreshold: 0.8,
            prerequisites: ['indian_place_value'],
            representations: ['symbolic', 'visual'],
            exerciseFamilies: ['expanded_form'],
            misconceptionTargets: ['Forgetting to multiply digit by place value'],
            recommendedWidgetCategories: ['place-value'],
            estimatedMinutes: 15,
          },
        ],
        documentId: 'math-level-b',
      } as unknown as T;
    }
    if (stage === 'lesson_blueprint') {
      return { blueprints: [] } as unknown as T;
    }
    return {} as T;
  }
}

describe('Math Level B — Lesson 1: Numbers (golden fixture)', () => {
  let fakeRouter: FakeRouter;

  beforeAll(() => {
    fakeRouter = new FakeRouter();
  });

  it('has a valid source inventory fixture', () => {
    expect(fixtureInventory.units.length).toBeGreaterThan(10);
    expect(fixtureInventory.totalPages).toBe(203);

    const types = fixtureInventory.units.map((u) => u.type);
    expect(types).toContain('lesson');
    expect(types).toContain('objective');
    expect(types).toContain('worked_example');
    expect(types).toContain('exercise');
  });

  it('generates concept map with source evidence', async () => {
    const result = await generateConceptMap(
      fakeRouter as unknown as LlmRouter,
      fixtureInventory.units,
      'Math Level B - Lesson 1',
      MATH_PROFILE,
    );

    expect(result.concepts.length).toBeGreaterThan(0);
    for (const concept of result.concepts) {
      expect(concept.sourceUnitIds.length).toBeGreaterThan(0);
    }
  });

  it('generates valid concept graph (no cycles)', () => {
    const { concepts } = {
      concepts: [
        {
          conceptId: 'indian_place_value',
          label: 'IPV',
          kind: 'knowledge' as const,
          sourceUnitIds: ['src-3'],
          learningObjective: 'Identify place values',
          coreIdea: 'Place value means digit position determines its value.',
          difficulty: 'beginner' as const,
          masteryThreshold: 0.8,
          prerequisites: [],
          representations: ['visual' as const, 'symbolic' as const],
          exerciseFamilies: ['pv_id'],
          misconceptionTargets: [],
          recommendedWidgetCategories: [],
          estimatedMinutes: 20,
        },
        {
          conceptId: 'comparison',
          label: 'CMP',
          kind: 'skill' as const,
          sourceUnitIds: ['src-10'],
          learningObjective: 'Compare two numbers',
          coreIdea: 'Compare digits from left to right.',
          difficulty: 'beginner' as const,
          masteryThreshold: 0.8,
          prerequisites: ['indian_place_value'],
          representations: ['symbolic' as const],
          exerciseFamilies: ['compare'],
          misconceptionTargets: [],
          recommendedWidgetCategories: [],
          estimatedMinutes: 15,
        },
      ],
    };
    const errors = validateConceptGraph(concepts);
    expect(errors).toEqual([]);
  });

  it('builds coverage ledger with 100% required coverage', () => {
    const concepts: Array<{
      conceptId: string;
      label: string;
      kind: 'knowledge';
      sourceUnitIds: string[];
      learningObjective: string;
      coreIdea: string;
      difficulty: 'beginner';
      masteryThreshold: number;
      prerequisites: string[];
      representations: Array<'visual'>;
      exerciseFamilies: string[];
      misconceptionTargets: string[];
      recommendedWidgetCategories: string[];
      estimatedMinutes: number;
    }> = [
      {
        conceptId: 'indian_place_value',
        label: 'IPV',
        kind: 'knowledge',
        sourceUnitIds: fixtureInventory.units.filter((u) => u.requiredCoverage).map((u) => u.id),
        learningObjective: 'Identify place values',
        coreIdea: 'Place value determines digit value.',
        difficulty: 'beginner',
        masteryThreshold: 0.8,
        prerequisites: [],
        representations: ['visual'],
        exerciseFamilies: ['pv_id'],
        misconceptionTargets: [],
        recommendedWidgetCategories: [],
        estimatedMinutes: 20,
      },
    ];
    const activityMap = new Map<string, string[]>();
    for (const c of concepts) activityMap.set(c.conceptId, ['act-1']);

    const ledger = buildCoverageLedger(
      fixtureInventory.units,
      concepts as any,
      [],
      [],
      activityMap,
    );
    expect(ledger.summary.percentRequiredCovered).toBe(100);
  });

  it('passes all publish gates', () => {
    const report = generateQualityReport({
      stageUsage: {},
      retries: 0,
      durationMs: 0,
      coverage: {
        coveredRequired: 10,
        percentRequiredCovered: 100,
        percentObjectiveCovered: 100,
        percentWorkedExampleCovered: 100,
        percentExerciseCovered: 100,
        percentAssessmentCovered: 100,
        conceptCount: 5,
        activityCount: 25,
        assetCount: 3,
      },
      validationIssues: [],
      widgetResults: [],
      reviewItems: [],
      assetCount: 3,
      conceptCount: 5,
      hasCycles: false,
    });

    expect(report.status).toBe('complete');
    expect(report.publishGates.requiredCoverage.passed).toBe(true);
    expect(report.publishGates.noDependencyCycles.passed).toBe(true);
  });

  it('records all stage calls', async () => {
    const r = new FakeRouter();
    await r.generateStructuredRaw('source_inventory', 'test', z.object({ x: z.number() }));
    await r.generateStructuredRaw('concept_map', 'test', z.object({ x: z.number() }));
    expect(r.calls.length).toBe(2);
    const stages = r.calls.map((c) => c.stage);
    expect(stages).toContain('concept_map');
  });

  it('fake router returns deterministically', async () => {
    const r = new FakeRouter();
    const a = await r.generateStructuredRaw(
      'source_inventory',
      'test',
      z.object({ x: z.number() }),
    );
    expect(a).toBeDefined();
  });
});
