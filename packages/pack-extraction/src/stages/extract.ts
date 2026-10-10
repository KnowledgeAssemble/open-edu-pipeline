import { z } from 'zod';
import type { LlmStage } from '@open-edu/pipeline-llm';

export const EXTRACT_PROMPT_VERSION = '1';
export const EXTRACT_SCHEMA_VERSION = '1';
export const MERGE_PROMPT_VERSION = '1';
export const MERGE_SCHEMA_VERSION = '1';

/** pipeline-llm stage aliases (its stage enum is closed and must not change). */
export const EXTRACT_STAGE: LlmStage = 'concept_map';
export const ESCALATION_STAGE: LlmStage = 'concept_enrichment';
export const MERGE_STAGE: LlmStage = 'review';

export const ExcerptConceptSchema = z.object({
  term: z.string(),
  summary: z.string(),
  excerpt: z.string(),
});

export const ExcerptObjectiveSchema = z.object({
  statement: z.string(),
  excerpt: z.string(),
});

export const ExcerptExampleSchema = z.object({
  term: z.string(),
  excerpt: z.string(),
});

export const ExcerptPrerequisiteSchema = z.object({
  fromTerm: z.string(),
  toTerm: z.string(),
  excerpt: z.string(),
});

export const ChapterExtractionSchema = z.object({
  concepts: z.array(ExcerptConceptSchema),
  objectives: z.array(ExcerptObjectiveSchema),
  examples: z.array(ExcerptExampleSchema),
  prerequisites: z.array(ExcerptPrerequisiteSchema),
});

export type ChapterExtraction = z.infer<typeof ChapterExtractionSchema>;
export type ExtractedConcept = z.infer<typeof ExcerptConceptSchema>;
export type ExtractedObjective = z.infer<typeof ExcerptObjectiveSchema>;

const SYSTEM_RULES = [
  'You extract source-grounded knowledge from one textbook chapter.',
  'Rules:',
  '1. Every "excerpt" MUST be copied verbatim from the provided chapter text.',
  '2. Do not invent terms that do not appear in the chapter.',
  '3. Do not normalize or correct spelling; copy the source spelling.',
  '4. Do not add Bloom levels or pedagogical commentary.',
  '5. Empty arrays are valid answers when the chapter contains nothing of that kind.',
  '6. Keep each excerpt under 600 characters.',
  '7. Respond with JSON only, matching the requested schema.',
].join('\n');

export function buildExtractPrompt(chapter: { title: string; markdown: string }): string {
  return [
    SYSTEM_RULES,
    '',
    `Chapter title: ${chapter.title}`,
    '',
    'Return an object with four arrays:',
    '- concepts: { term, summary, excerpt } — key ideas named in the chapter.',
    '- objectives: { statement, excerpt } — stated learning objectives.',
    '- examples: { term, excerpt } — worked examples, naming the concept.',
    '- prerequisites: { fromTerm, toTerm, excerpt } — one concept must be understood first.',
    '',
    '--- CHAPTER START ---',
    chapter.markdown,
    '--- CHAPTER END ---',
  ].join('\n');
}
