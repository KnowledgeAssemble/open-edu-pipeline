// Local mirror. Canonical source of truth: @open-edu/packs (open-edu repo, Pack System story 1.1).
import { z } from 'zod';

export const LEARNING_INTENTS = z.enum([
  'assess',
  'practice',
  'observe',
  'compare',
  'explore',
  'create',
  'reflect',
  'apply',
  'listen',
  'recall',
  'understand',
]);

export type LearningIntent = z.infer<typeof LEARNING_INTENTS>;

export const ConceptRefSchema = z.object({
  pack: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  concept: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
});

export type ConceptRefSchema = z.infer<typeof ConceptRefSchema>;
export type ConceptRef = z.infer<typeof ConceptRefSchema>;

export const ObjectiveSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    description: z.string().min(1).max(500),
    bloomLevel: z
      .enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'])
      .optional(),
    concepts: z.array(ConceptRefSchema).default([]),
    requiresIntents: z.array(LEARNING_INTENTS).min(1),
  })
  .strict();

export type ObjectiveSchema = z.infer<typeof ObjectiveSchema>;
export type Objective = z.infer<typeof ObjectiveSchema>;

export const CurriculumUnitSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    title: z.string().min(1).max(256),
    description: z.string().max(2000).optional(),
    concepts: z.array(ConceptRefSchema).default([]),
    objectives: z.array(ObjectiveSchema).min(1),
    estimatedMinutes: z.number().int().positive().optional(),
    prerequisites: z.array(z.string()).default([]),
  })
  .strict();

export type CurriculumUnitSchema = z.infer<typeof CurriculumUnitSchema>;
export type CurriculumUnit = z.infer<typeof CurriculumUnitSchema>;

export const CurriculumSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    title: z.string().min(1).max(256),
    subject: z.string().min(1).max(128),
    level: z.string().max(64).optional(),
    units: z.array(CurriculumUnitSchema).min(1),
  })
  .strict();

export type CurriculumSchema = z.infer<typeof CurriculumSchema>;
export type Curriculum = z.infer<typeof CurriculumSchema>;
