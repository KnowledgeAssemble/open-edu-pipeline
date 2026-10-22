import { z } from 'zod';
import type { LlmStage } from '@open-edu/pipeline-llm';

export const EXTRACT_PROMPT_VERSION = '4';
export const EXTRACT_ESCALATION_PROMPT_VERSION = '4';
export const EXTRACT_SCHEMA_VERSION = '2';
export const MERGE_PROMPT_VERSION = '2';
export const MERGE_SCHEMA_VERSION = '1';

export const CHAPTER_START_MARKER = '--- CHAPTER START ---';
export const CHAPTER_END_MARKER = '--- CHAPTER END ---';

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
  /** Exact `term` values of the concepts this objective practises. */
  conceptTerms: z.array(z.string()),
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
  '2. Each excerpt MUST be a single contiguous run of characters copied from ONE place in the chapter. Never join text from different lines, bullet points, table cells, or paragraphs.',
  '3. Do not add, remove, or alter bullets, list markers, symbols, punctuation, or capitalization. Copy them exactly as they appear.',
  '4. Do not invent terms that do not appear in the chapter.',
  '5. Do not normalize or correct spelling; copy the source spelling.',
  '6. Do not add Bloom levels or pedagogical commentary.',
  '7. Empty arrays are valid answers when the chapter contains nothing of that kind.',
  '8. Keep each excerpt under 600 characters.',
  '9. Respond with JSON only, matching the requested schema.',
  "10. Emit one objective per stated learning objective in the chapter (one per bullet when the chapter lists them). A parent bullet whose sub-bullets are lettered or numbered ((i), (ii), (a), 1., 2.) states SEVERAL objectives: emit one objective for the parent and one for each sub-bullet, using the sub-bullet text as that objective's excerpt. Never merge several stated objectives into a single objective, and never invent an objective the chapter does not state.",
  '11. An objective excerpt must cover that one objective only, never several bullet points or lines joined together.',
  '12. Extract at least one concept from every numbered teaching section of the chapter (sections titled like "1.1" or "2.10"). A numbered section with no concept makes the chapter incomplete.',
  '13. For each objective, list in "conceptTerms" the exact "term" values of the concepts that objective practises, and nothing else.',
].join('\n');

/** Neutralize the chapter fences so source text cannot break the prompt structure. */
export function sanitizeChapterText(markdown: string): string {
  return markdown
    .split(CHAPTER_START_MARKER)
    .join('[escaped chapter-start]')
    .split(CHAPTER_END_MARKER)
    .join('[escaped chapter-end]');
}

export function buildExtractPrompt(chapter: { title: string; markdown: string }): string {
  return [
    SYSTEM_RULES,
    '',
    `Chapter title: ${chapter.title}`,
    '',
    'Return an object with four arrays:',
    '- concepts: { term, summary, excerpt } — key ideas named in the chapter, at least one per numbered teaching section.',
    '- objectives: { statement, excerpt, conceptTerms } — one objective per stated learning objective; the excerpt is that single objective copied verbatim; conceptTerms are the exact terms of the concepts it practises.',
    '- examples: { term, excerpt } — worked examples, naming the concept.',
    '- prerequisites: { fromTerm, toTerm, excerpt } — one concept must be understood first.',
    '',
    CHAPTER_START_MARKER,
    sanitizeChapterText(chapter.markdown),
    CHAPTER_END_MARKER,
  ].join('\n');
}

/**
 * Escalation prompt. Identical grounding rules, plus the deterministic verifier's
 * rejection reasons from the fast-tier attempt so the stronger model can fix them.
 */
export function buildEscalationPrompt(
  chapter: { title: string; markdown: string },
  failures: string[],
): string {
  const lines = [buildExtractPrompt(chapter)];
  if (failures.length > 0) {
    lines.push(
      '',
      'A previous extraction attempt for this chapter was rejected by a deterministic verifier.',
      'Fix ONLY these problems and close these gaps. Every "excerpt" MUST still be copied verbatim from the chapter:',
      ...failures.map((failure) => `- ${failure}`),
    );
  }
  return lines.join('\n');
}
