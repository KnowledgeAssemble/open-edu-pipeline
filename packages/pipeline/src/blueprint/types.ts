import { z } from 'zod';

export const LESSON_ARC_STEPS = [
  'hook',
  'observe',
  'worked_example',
  'guided_practice',
  'widget_practice',
  'independent_practice',
  'mastery_check',
  'remediation',
  'extension',
  'positive_completion',
] as const;

export type LessonArcStep = (typeof LESSON_ARC_STEPS)[number];

export const AssetRequestSchema = z.object({
  id: z.string().min(1),
  rendererType: z.string().min(1),
  parameters: z.record(z.unknown()),
  description: z.string(),
});

export const WidgetRequestSchema = z.object({
  step: z.enum(LESSON_ARC_STEPS),
  widgetCategory: z.string(),
  mode: z.enum(['observe', 'interactive']),
  description: z.string(),
});

export const LessonBlueprintSchema = z.object({
  conceptId: z.string().min(1),
  sourceUnitIds: z.array(z.string()).min(1),
  objective: z.string().min(10),
  priorKnowledge: z.array(z.string()).nullable().optional(),
  representations: z.array(z.enum(['concrete', 'visual', 'symbolic'])).min(1),
  lessonArc: z
    .array(
      z.object({
        step: z.enum(LESSON_ARC_STEPS),
        description: z.string(),
        durationMinutes: z.number().int().min(1).max(20),
      }),
    )
    .min(2),
  assetRequests: z.array(AssetRequestSchema).nullable().optional(),
  widgetRequests: z.array(WidgetRequestSchema).nullable().optional(),
  questionFamilies: z.array(z.string()).nullable().optional(),
  misconceptionTargets: z.array(z.string()).nullable().optional(),
});

export type LessonBlueprint = z.infer<typeof LessonBlueprintSchema>;

export const BlueprintResponseSchema = z.object({
  conceptId: z.string(),
  sourceUnitIds: z.array(z.string()),
  objective: z.string(),
  priorKnowledge: z.array(z.string()).nullable().optional(),
  representations: z.array(z.string()),
  lessonArc: z.array(
    z.object({
      step: z.string(),
      description: z.string(),
      durationMinutes: z.number().int(),
    }),
  ),
  assetRequests: z
    .array(
      z.object({
        id: z.string(),
        rendererType: z.string(),
        parameters: z.record(z.unknown()).nullable().optional(),
        description: z.string(),
      }),
    )
    .nullable()
    .optional(),
  widgetRequests: z
    .array(
      z.object({
        step: z.string(),
        widgetCategory: z.string(),
        mode: z.string(),
        description: z.string(),
      }),
    )
    .nullable()
    .optional(),
  questionFamilies: z.array(z.string()).nullable().optional(),
  misconceptionTargets: z.array(z.string()).nullable().optional(),
});
export type BlueprintResponse = z.infer<typeof BlueprintResponseSchema>;

export function validateBlueprint(
  blueprint: LessonBlueprint,
  profile?: { assetRendererTypes: string[] },
): string[] {
  const errors: string[] = [];

  if (blueprint.sourceUnitIds.length === 0) {
    errors.push(`Blueprint for "${blueprint.conceptId}" has no source units`);
  }

  if (!blueprint.lessonArc.some((a) => a.step === 'mastery_check')) {
    errors.push(`Blueprint for "${blueprint.conceptId}" has no mastery_check step`);
  }

  if (
    blueprint.representations.includes('visual') &&
    (!blueprint.assetRequests || blueprint.assetRequests.length === 0)
  ) {
    errors.push(`Blueprint for "${blueprint.conceptId}" is visual but has no asset requests`);
  }

  const validSteps = ['observe', 'widget_practice', 'guided_practice', 'independent_practice'];
  for (const wr of blueprint.widgetRequests ?? []) {
    if (!validSteps.includes(wr.step)) {
      errors.push(
        `Blueprint for "${blueprint.conceptId}" has widget request for unsupported step "${wr.step}"`,
      );
    }
  }

  if (profile && profile.assetRendererTypes.length > 0) {
    for (const ar of blueprint.assetRequests ?? []) {
      if (!profile.assetRendererTypes.includes(ar.rendererType)) {
        errors.push(
          `Blueprint for "${blueprint.conceptId}" uses unsupported renderer type "${ar.rendererType}"`,
        );
      }
    }
  }

  return errors;
}
