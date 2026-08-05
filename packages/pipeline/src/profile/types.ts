import { z } from 'zod';

export const SourceTaxonomySchema = z.object({
  lessonLabels: z.array(z.string()),
  sectionLabels: z.array(z.string()),
  objectiveLabels: z.array(z.string()),
  definitionLabels: z.array(z.string()),
  exampleLabels: z.array(z.string()),
  exerciseLabels: z.array(z.string()),
  reviewLabels: z.array(z.string()),
  assessmentLabels: z.array(z.string()),
});

export type SourceTaxonomy = z.infer<typeof SourceTaxonomySchema>;

function noDuplicate(arr: string[]) {
  return new Set(arr).size === arr.length;
}

export const CurriculumProfileSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'Profile ID must match /^[a-z][a-z0-9_-]*$/'),
    subject: z.string().min(1, 'Subject is required'),
    curriculum: z.string().optional(),
    locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, 'Locale must match en-IN format'),
    language: z.string().regex(/^[a-z]{2}$/, 'Language must match en format'),
    sourceTaxonomy: SourceTaxonomySchema,
    conceptKinds: z.array(z.string()),
    representations: z.array(z.string()),
    questionFamilies: z.array(z.string()),
    widgetCategories: z.array(z.string()),
    assetRendererTypes: z.array(z.string()),
    validatorIds: z.array(z.string()),
    promptContext: z.record(z.unknown()),
  })
  .refine((p) => noDuplicate(p.conceptKinds), {
    message: 'conceptKinds must not contain duplicates',
  })
  .refine((p) => noDuplicate(p.representations), {
    message: 'representations must not contain duplicates',
  })
  .refine((p) => noDuplicate(p.questionFamilies), {
    message: 'questionFamilies must not contain duplicates',
  })
  .refine((p) => noDuplicate(p.widgetCategories), {
    message: 'widgetCategories must not contain duplicates',
  })
  .refine((p) => noDuplicate(p.assetRendererTypes), {
    message: 'assetRendererTypes must not contain duplicates',
  })
  .refine((p) => noDuplicate(p.validatorIds), {
    message: 'validatorIds must not contain duplicates',
  });

export type CurriculumProfile = z.infer<typeof CurriculumProfileSchema>;
