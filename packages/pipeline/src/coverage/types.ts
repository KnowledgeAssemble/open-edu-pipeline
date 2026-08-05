import { z } from 'zod';

export const COVERAGE_STATUSES = [
  'covered',
  'partially_covered',
  'uncovered',
  'not_applicable',
] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export const CoverageEntrySchema = z.object({
  sourceUnitId: z.string(),
  sourceType: z.string(),
  concepts: z.array(z.string()),
  blueprints: z.array(z.string()),
  activities: z.array(z.string()),
  assets: z.array(z.string()),
  status: z.enum(COVERAGE_STATUSES),
  reviewNotes: z.string().optional(),
});

export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;

export const CoverageLedgerSchema = z.object({
  documentId: z.string(),
  totalSourceUnits: z.number().int().min(0),
  requiredSourceUnits: z.number().int().min(0),
  entries: z.array(CoverageEntrySchema),
  summary: z.object({
    coveredRequired: z.number(),
    percentRequiredCovered: z.number().min(0).max(100),
    percentObjectiveCovered: z.number().min(0).max(100),
    percentWorkedExampleCovered: z.number().min(0).max(100),
    percentExerciseCovered: z.number().min(0).max(100),
    percentAssessmentCovered: z.number().min(0).max(100),
    conceptCount: z.number(),
    activityCount: z.number(),
    assetCount: z.number(),
  }),
});

export type CoverageLedger = z.infer<typeof CoverageLedgerSchema>;
