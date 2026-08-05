import { z } from 'zod';

export const SOURCE_UNIT_TYPES = [
  'lesson',
  'section',
  'objective',
  'definition',
  'worked_example',
  'exercise',
  'review',
  'assessment',
  'diagram',
  'unclassified',
] as const;

export type SourceUnitType = (typeof SOURCE_UNIT_TYPES)[number];

export const SourceLocationSchema = z.object({
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive().optional(),
  heading: z.string().optional(),
  sectionId: z.string().optional(),
});

export type SourceLocation = z.infer<typeof SourceLocationSchema>;

export const SourceUnitSchema = z.object({
  id: z.string().min(1),
  type: z.enum(SOURCE_UNIT_TYPES),
  text: z.string(),
  location: SourceLocationSchema,
  parentId: z.string().optional(),
  extractionConfidence: z.number().min(0).max(1),
  requiredCoverage: z.boolean(),
});

export type SourceUnit = z.infer<typeof SourceUnitSchema>;

export const SourceInventorySchema = z.object({
  documentId: z.string(),
  title: z.string(),
  totalPages: z.number().int().positive(),
  units: z.array(SourceUnitSchema),
  warnings: z.array(z.string()),
});

export type SourceInventory = z.infer<typeof SourceInventorySchema>;

export const InventoryLLMResponseSchema = z.object({
  classifications: z.array(
    z.object({
      unitId: z.string(),
      type: z.enum(SOURCE_UNIT_TYPES),
      extractionConfidence: z.number().min(0).max(1),
    }),
  ),
});
