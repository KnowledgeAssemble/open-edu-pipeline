import { z } from 'zod';
import type { LlmProvider } from '@open-edu/pipeline-llm';
import type { Concept } from '../concepts/types.js';
import type { LessonBlueprint } from '../blueprint/types.js';
import type { CurriculumProfile } from '../profile/types.js';
import type { SourceUnit } from '../source/types.js';
import type { GeneratedConcept, GeneratedActivity, ActivityContent } from '../types.js';

import { EXEMPLARS } from './exemplars.js';
import { OBSERVE_PROMPT } from './prompts/observe.js';
import { GUIDED_PRACTICE_PROMPT } from './prompts/guided-practice.js';
import { INDEPENDENT_PRACTICE_PROMPT } from './prompts/independent-practice.js';
import { MASTERY_CHECK_PROMPT } from './prompts/mastery-check.js';
import { POSITIVE_COMPLETION_PROMPT } from './prompts/positive-completion.js';
import {
  getWidgetSchema,
  registerAllWidgetSchemas,
  normalizeWidgetId,
  isWidgetAllowedForProfile,
} from './widget-schemas.js';

registerAllWidgetSchemas();

const ARC_STEP_TO_PROMPT: Record<string, string> = {
  hook: OBSERVE_PROMPT,
  observe: OBSERVE_PROMPT,
  worked_example: OBSERVE_PROMPT,
  guided_practice: GUIDED_PRACTICE_PROMPT,
  widget_practice: GUIDED_PRACTICE_PROMPT,
  independent_practice: INDEPENDENT_PRACTICE_PROMPT,
  mastery_check: MASTERY_CHECK_PROMPT,
  remediation: OBSERVE_PROMPT,
  extension: INDEPENDENT_PRACTICE_PROMPT,
  positive_completion: POSITIVE_COMPLETION_PROMPT,
};

const ARC_STEP_TO_TYPE: Record<string, string> = {
  hook: 'reading',
  observe: 'reading',
  worked_example: 'reading',
  guided_practice: 'exercise',
  widget_practice: 'widget',
  independent_practice: 'exercise',
  mastery_check: 'quiz',
  remediation: 'reading',
  extension: 'exercise',
  positive_completion: 'reflection',
};

const readingContentSchema = z.object({
  description: z.string(),
  instructions: z.string(),
  examples: z.array(z.string()).nullable().optional(),
});

const exerciseContentSchema = z.object({
  description: z.string(),
  instructions: z.string(),
  examples: z.array(z.string()).nullable().optional(),
});

const quizContentSchema = z.object({
  description: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).length(4),
      correctIndex: z.number().min(0).max(3),
    }),
  ),
});

const reflectionContentSchema = z.object({
  description: z.string(),
  instructions: z.string(),
});

const widgetContentSchema = z.object({
  description: z.string(),
  instructions: z.string(),
  examples: z.array(z.string()).nullable().optional(),
});

function stepOutputSchema(type: string): z.ZodType {
  if (type === 'reading' || type === 'exercise') {
    const textContent = type === 'reading' ? readingContentSchema : exerciseContentSchema;
    return z.discriminatedUnion('type', [
      z.object({ type: z.literal(type), content: textContent }),
      z.object({
        type: z.literal('widget'),
        widgetId: z.string().min(1),
        widgetConfig: z.record(z.unknown()),
        content: widgetContentSchema,
      }),
    ]);
  }
  switch (type) {
    case 'quiz':
      return z.object({ type: z.literal('quiz'), content: quizContentSchema });
    case 'reflection':
      return z.object({ type: z.literal('reflection'), content: reflectionContentSchema });
    case 'widget':
      return z.object({
        type: z.literal('widget'),
        widgetId: z.string().min(1),
        widgetConfig: z.record(z.unknown()),
        content: widgetContentSchema,
      });
    default:
      throw new Error(`Unknown activity type: ${type}`);
  }
}

function buildStepPrompt(
  step: string,
  type: string,
  concept: GeneratedConcept,
  profile: CurriculumProfile,
  validationErrors?: string[],
): string {
  const template = ARC_STEP_TO_PROMPT[step];
  if (!template) throw new Error(`Unknown step: ${step}`);

  const defaultExemplars = EXEMPLARS.filter((e) => e.type === type && e.step === step);
  const widgetExemplars = EXEMPLARS.filter((e) => e.type === 'widget' && e.step === step);
  const allExemplars = [...defaultExemplars, ...widgetExemplars];
  const exemplarSection =
    allExemplars.length > 0
      ? `\n## Good Examples for This Step\n${allExemplars.map((e) => JSON.stringify(e, null, 2)).join('\n\n')}`
      : '';

  const retrySection =
    validationErrors && validationErrors.length > 0
      ? `\n\n## Validation Errors to Fix\n${validationErrors.map((e) => `  - ${e}`).join('\n')}\nPlease ensure your output does not have these issues.`
      : '';

  const prompt = template
    .replace(/{CONCEPT_ID}/g, concept.conceptId)
    .replace(/{LEARNING_OBJECTIVE}/g, concept.learningObjective)
    .replace(/{CORE_IDEA}/g, concept.coreIdea)
    .replace(/{EXAMPLES}/g, concept.examples.map((e) => `  - ${e}`).join('\n'))
    .replace(/{MISCONCEPTIONS}/g, concept.misconceptions.map((m) => `  - ${m}`).join('\n'))
    .replace(/{PROFILE_SUBJECT}/g, profile.subject)
    .replace(
      /{PROFILE_STYLE}/g,
      (profile.promptContext?.teachingStyle as string) || 'scaffolded discovery',
    )
    .replace(/{QUESTION_FAMILIES}/g, profile.questionFamilies.join(', '));

  return `${prompt}\n\nGenerate the ${step} activity now as a JSON object. You may use "${type}" for text or "widget" for an interactive activity from the catalog — choose whichever suits the concept best.${exemplarSection}${retrySection}`;
}

function buildRetryPrompt(basePrompt: string, errors: string[], previousAttempt: unknown): string {
  return `${basePrompt}\n\nThe previous attempt failed validation with these errors:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\nPrevious attempt:\n${JSON.stringify(previousAttempt, null, 2)}\n\nPlease fix the issues and try again.`;
}

function contentToActivityContent(
  type: string,
  content: Record<string, unknown>,
  widgetConfig?: Record<string, unknown>,
): ActivityContent {
  if (type === 'quiz') {
    const questions =
      (content.questions as Array<Record<string, unknown>>)?.map((q) => ({
        question: q.question as string,
        options: q.options as string[],
        correctIndex: q.correctIndex as number,
      })) ?? [];
    return {
      description: content.description as string,
      questions,
    };
  }
  return {
    description: content.description as string,
    instructions: content.instructions as string,
    examples: content.examples as string[] | undefined,
    widgetConfig: type === 'widget' ? widgetConfig : undefined,
  };
}

async function generateStep(
  llm: LlmProvider,
  step: string,
  type: string,
  concept: GeneratedConcept,
  profile: CurriculumProfile,
  order: number,
  maxRetries: number,
  validationErrors?: string[],
): Promise<{
  activity: GeneratedActivity | null;
  errors: string[];
}> {
  const basePrompt = buildStepPrompt(step, type, concept, profile, validationErrors);
  const outputSchema = stepOutputSchema(type);

  let lastErrors: string[] = [];
  let lastAttempt: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const prompt =
        attempt === 0 ? basePrompt : buildRetryPrompt(basePrompt, lastErrors, lastAttempt);
      const result = await llm.generateStructured(prompt, outputSchema, {
        temperature: attempt === 0 ? 0.4 : 0.5,
        maxTokens: 4096,
      });

      const responseType = (result.type as string) || type;

      let validatedWidgetId: string | undefined;
      let validatedWidgetConfig: Record<string, unknown> | undefined;
      if (responseType === 'widget') {
        const widgetId = normalizeWidgetId(result.widgetId as string);
        validatedWidgetId = widgetId;
        const rawConfig = result.widgetConfig as Record<string, unknown> | undefined;
        const widgetSchema = getWidgetSchema(widgetId);
        if (widgetSchema && rawConfig) {
          const parseResult = widgetSchema.safeParse(rawConfig);
          if (!parseResult.success) {
            if (attempt < maxRetries) {
              lastErrors = [
                `Widget '${widgetId}' config validation failed: ${parseResult.error.message}`,
              ];
              lastAttempt = result;
              continue;
            }
            const content = result.content as Record<string, unknown> | undefined;
            const fallbackActivity: GeneratedActivity = {
              step: step as GeneratedActivity['step'],
              courseSpecType: 'reading',
              order,
              content: {
                description: (content?.description as string) || '',
                instructions: (content?.instructions as string) || '',
                examples: content?.examples as string[] | undefined,
              },
            };
            return { activity: fallbackActivity, errors: [] };
          }
          validatedWidgetConfig = parseResult.data;
        } else {
          validatedWidgetConfig = rawConfig;
        }

        if (!isWidgetAllowedForProfile(widgetId, profile)) {
          const content = result.content as Record<string, unknown> | undefined;
          const fallbackActivity: GeneratedActivity = {
            step: step as GeneratedActivity['step'],
            courseSpecType: 'reading',
            order,
            content: {
              description: (content?.description as string) || '',
              instructions: (content?.instructions as string) || '',
              examples: content?.examples as string[] | undefined,
            },
          };
          return { activity: fallbackActivity, errors: [] };
        }
      }

      const activity: GeneratedActivity = {
        step: step as GeneratedActivity['step'],
        courseSpecType: responseType as GeneratedActivity['courseSpecType'],
        order,
        content: contentToActivityContent(
          responseType,
          (result.content as Record<string, unknown>) || {},
          validatedWidgetConfig,
        ),
        widgetId:
          responseType === 'widget' ? validatedWidgetId || (result.widgetId as string) : undefined,
        widgetConfig: validatedWidgetConfig,
      };

      if (activity.courseSpecType === 'quiz' && activity.content.questions) {
        for (const q of activity.content.questions) {
          if (q && q.options) {
            const uniqueOpts = new Set<string>(q.options);
            if (uniqueOpts.size !== q.options.length) {
              const seen = new Map<string, number>();
              for (let i = 0; i < q.options.length; i++) {
                const opt = q.options[i];
                if (opt === undefined) continue;
                if (seen.has(opt)) {
                  q.options[i] = opt + ' (option ' + (i + 1) + ')';
                }
                seen.set(opt, i);
              }
            }
          }
        }
      }

      return { activity, errors: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastErrors = [message];
      lastAttempt = null;
    }
  }

  return {
    activity: null,
    errors: [`${step} (${type}): failed after ${maxRetries + 1} attempts`],
  };
}

const MAX_RETRIES = 3;

export interface ActivityGenerationInput {
  concept: Concept;
  blueprint: LessonBlueprint;
  profile: CurriculumProfile;
  sourceUnits: SourceUnit[];
}

function conceptToGeneratedConcept(concept: Concept, blueprint: LessonBlueprint): GeneratedConcept {
  return {
    conceptId: concept.conceptId,
    chapterCode: blueprint.lessonArc[0]?.step || 'hook',
    chapterName: concept.label,
    learningObjective: concept.learningObjective,
    coreIdea: concept.coreIdea,
    examples: [],
    misconceptions: concept.misconceptionTargets ?? [],
    supports: { visual: concept.representations.includes('visual') },
    masteryCriteria: concept.masteryThreshold,
    difficulty: concept.difficulty as GeneratedConcept['difficulty'],
    estimatedDuration: concept.estimatedMinutes ?? 30,
    dependencies: concept.prerequisites ?? [],
  };
}

export async function generateActivitiesFromBlueprint(
  llm: LlmProvider,
  input: ActivityGenerationInput,
  validationErrors?: string[],
): Promise<{
  activities: GeneratedActivity[];
  warnings: string[];
  errors: string[];
}> {
  const generatedConcept = conceptToGeneratedConcept(input.concept, input.blueprint);
  const activities: GeneratedActivity[] = [];
  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  const arc = input.blueprint.lessonArc;
  for (let i = 0; i < arc.length; i++) {
    const arcStep = arc[i]!;
    const step = arcStep.step;
    const type = ARC_STEP_TO_TYPE[step] || 'reading';

    const result = await generateStep(
      llm,
      step,
      type,
      generatedConcept,
      input.profile,
      i + 1,
      MAX_RETRIES,
      validationErrors,
    );

    if (result.activity) {
      activities.push(result.activity);
    } else {
      allErrors.push(...result.errors);
    }
  }

  return { activities, warnings: allWarnings, errors: allErrors };
}
