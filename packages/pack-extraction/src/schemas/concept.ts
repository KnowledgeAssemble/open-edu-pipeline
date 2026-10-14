// Local mirror. Canonical source of truth: @open-edu/packs (open-edu repo, Pack System story 1.1).
import { z } from 'zod';

export const ConceptSourceSchema = z.object({
  documentId: z.string().min(1).max(128),
  locator: z.string().min(1).max(256).optional(),
  section: z.string().max(256).optional(),
  page: z.number().int().positive().optional(),
  excerpt: z.string().max(2000).optional(),
});

export type ConceptSourceSchema = z.infer<typeof ConceptSourceSchema>;
export type ConceptSource = z.infer<typeof ConceptSourceSchema>;

export const ConceptSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9_-]*$/),
    title: z.string().min(1).max(256),
    summary: z.string().min(1).max(2000),
    domainTags: z.array(z.string().min(1).max(64)).min(1),
    examples: z.array(z.string().max(1000)).max(10).optional(),
    misconceptions: z.array(z.string().max(1000)).max(10).optional(),
    prerequisites: z
      .array(
        z
          .string()
          .min(1)
          .max(128)
          .regex(/^[a-z0-9][a-z0-9_-]*$/),
      )
      .max(20)
      .optional(),
    source: ConceptSourceSchema.optional(),
  })
  .strict();

export type ConceptSchema = z.infer<typeof ConceptSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
