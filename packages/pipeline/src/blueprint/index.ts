import type { LlmRouter } from '@open-edu/pipeline-llm';
import type { Concept } from '../concepts/types.js';
import type { SourceUnit } from '../source/types.js';
import type { CurriculumProfile } from '../profile/types.js';
import type { LessonBlueprint } from './types.js';
import { LessonBlueprintSchema, validateBlueprint, BlueprintResponseSchema } from './types.js';
import type { LessonArcStep } from './types.js';
import { buildBlueprintPrompt } from './prompt.js';

function normalizeBlueprint(raw: Record<string, unknown>, conceptId: string): LessonBlueprint {
  return {
    conceptId: conceptId,
    sourceUnitIds: Array.isArray(raw.sourceUnitIds) ? (raw.sourceUnitIds as string[]) : [],
    objective: (raw.objective as string) || 'Learn the concept',
    priorKnowledge: Array.isArray(raw.priorKnowledge) ? (raw.priorKnowledge as string[]) : [],
    representations: Array.isArray(raw.representations)
      ? ((raw.representations as string[]).filter((r) =>
          ['concrete', 'visual', 'symbolic'].includes(r),
        ) as LessonBlueprint['representations'])
      : (['visual'] as LessonBlueprint['representations']),
    lessonArc: Array.isArray(raw.lessonArc)
      ? (raw.lessonArc as Array<Record<string, unknown>>).map((a) => ({
          step: (a.step as LessonBlueprint['lessonArc'][number]['step']) || 'observe',
          description: (a.description as string) || '',
          durationMinutes: Math.min(
            Math.max(typeof a.durationMinutes === 'number' ? a.durationMinutes : 5, 1),
            20,
          ),
        }))
      : [{ step: 'observe', description: '', durationMinutes: 5 }],
    assetRequests: Array.isArray(raw.assetRequests)
      ? (raw.assetRequests as Array<Record<string, unknown>>).map((a) => ({
          id: (a.id as string) || 'asset-1',
          rendererType: (a.rendererType as string) || 'number-line',
          parameters: (a.parameters as Record<string, unknown>) || {},
          description: (a.description as string) || '',
        }))
      : [],
    widgetRequests: Array.isArray(raw.widgetRequests)
      ? (raw.widgetRequests as Array<Record<string, unknown>>).map((w) => ({
          step: (w.step as LessonArcStep) || 'observe',
          widgetCategory: (w.widgetCategory as string) || 'core',
          mode: (w.mode === 'interactive' ? 'interactive' : 'observe') as 'observe' | 'interactive',
          description: (w.description as string) || '',
        }))
      : [],
    questionFamilies: Array.isArray(raw.questionFamilies)
      ? (raw.questionFamilies as string[])
      : ['direct_question'],
    misconceptionTargets: Array.isArray(raw.misconceptionTargets)
      ? (raw.misconceptionTargets as string[])
      : [],
  };
}

export async function generateLessonBlueprints(
  router: LlmRouter,
  concepts: Concept[],
  sourceUnits: SourceUnit[],
  profile: CurriculumProfile,
): Promise<{ blueprints: LessonBlueprint[]; warnings: string[] }> {
  const warnings: string[] = [];
  const blueprints: LessonBlueprint[] = [];

  for (const concept of concepts) {
    const prompt = buildBlueprintPrompt(concept, sourceUnits, profile);
    const raw = await router.generateStructuredRaw(
      'lesson_blueprint',
      prompt,
      BlueprintResponseSchema,
      { temperature: 0.3 },
    );

    const normalized = normalizeBlueprint(
      raw as unknown as Record<string, unknown>,
      concept.conceptId,
    );
    const parsed = LessonBlueprintSchema.safeParse(normalized);
    if (!parsed.success) {
      warnings.push(`[${concept.conceptId}] blueprint failed validation: ${parsed.error.message}`);
      continue;
    }

    const errors = validateBlueprint(parsed.data);
    if (errors.length > 0) {
      warnings.push(...errors.map((e) => `[${normalized.conceptId}] ${e}`));
    } else {
      blueprints.push(parsed.data);
    }
  }

  return { blueprints, warnings };
}
