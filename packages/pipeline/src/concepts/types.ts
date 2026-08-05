import { z } from 'zod';

export const CONCEPT_KINDS = ['skill', 'knowledge', 'procedure', 'application'] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];

export const REPRESENTATION_TYPES = ['concrete', 'visual', 'symbolic'] as const;

export const ConceptSchema = z.object({
  conceptId: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(3),
  kind: z.enum(CONCEPT_KINDS),
  sourceUnitIds: z.array(z.string()).min(1),
  learningObjective: z.string().min(10),
  coreIdea: z.string().min(20),
  difficulty: z.string(),
  masteryThreshold: z.number().min(0.5).max(1),
  prerequisites: z.array(z.string()).nullable().optional(),
  representations: z.array(z.enum(REPRESENTATION_TYPES)).min(1),
  exerciseFamilies: z.array(z.string()).nullable().optional(),
  misconceptionTargets: z.array(z.string()).nullable().optional(),
  adultContext: z.string().nullable().optional(),
  recommendedWidgetCategories: z.array(z.string()).nullable().optional(),
  estimatedMinutes: z.number().int().min(5).max(60).nullable().optional(),
  extensions: z.record(z.unknown()).nullable().optional(),
});

export type Concept = z.infer<typeof ConceptSchema>;

export const ConceptMapResponseSchema = z.object({
  concepts: z.array(
    z.object({
      conceptId: z.string(),
      label: z.string(),
      kind: z.string(),
      sourceUnitIds: z.array(z.string()),
      learningObjective: z.string(),
      coreIdea: z.string(),
      difficulty: z.string(),
      masteryThreshold: z.number(),
      prerequisites: z.array(z.string()).nullable().optional(),
      representations: z.array(z.string()),
      exerciseFamilies: z.array(z.string()).nullable().optional(),
      misconceptionTargets: z.array(z.string()).nullable().optional(),
      adultContext: z.string().nullable().optional(),
      recommendedWidgetCategories: z.array(z.string()).nullable().optional(),
      estimatedMinutes: z.number().int().nullable().optional(),
      extensions: z.record(z.unknown()).nullable().optional(),
    }),
  ),
});

export type ConceptMapResponse = z.infer<typeof ConceptMapResponseSchema>;
