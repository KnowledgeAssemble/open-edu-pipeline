import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LlmProvider, LlmRouter } from '@open-edu/pipeline-llm';
import type { ChapterChunk, ConceptCandidate } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const conceptCandidateSchema = z.object({
  concepts: z
    .array(
      z.object({
        conceptId: z
          .string()
          .regex(/^[a-z]+[a-z0-9_]*$/, 'conceptId must be lowercase with underscores'),
        learningObjective: z.string().min(10, 'learningObjective must be at least 10 characters'),
        coreIdea: z.string().min(1),
        examples: z.array(z.string()).min(2).max(5),
        misconceptions: z.array(z.string()).min(0).max(3),
        suggestedDependencies: z.array(z.string()),
        estimatedDuration: z.number().positive(),
        sourceSections: z.array(z.string()),
      }),
    )
    .min(1)
    .max(8),
});

const TOKEN_LIMIT = 50000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function prepareChapterText(chapter: ChapterChunk, maxTokens: number): string[] {
  const fullText = chapter.sections
    .map((s) => {
      let text = s.heading ? `${s.heading}\n` : '';
      text += s.body ? `${s.body}\n` : '';
      text += s.examples.length > 0 ? s.examples.map((e) => `  ${e}`).join('\n') + '\n' : '';
      text += s.exercises.length > 0 ? s.exercises.map((e) => `  ${e}`).join('\n') + '\n' : '';
      return text;
    })
    .join('\n');

  if (estimateTokens(fullText) <= maxTokens) {
    return [fullText];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  for (const section of chapter.sections) {
    const sectionText = [
      section.heading,
      section.body,
      ...section.examples.map((e) => `  ${e}`),
      ...section.exercises.map((e) => `  ${e}`),
    ]
      .filter(Boolean)
      .join('\n');

    if (estimateTokens(currentChunk + sectionText) > maxTokens && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sectionText;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + sectionText;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function loadPromptTemplate(): string {
  const promptPath = join(__dirname, 'prompts', 'chapter-concepts.txt');
  return readFileSync(promptPath, 'utf-8');
}

function buildPrompt(
  template: string,
  chapter: ChapterChunk,
  chapterText: string,
  existingConceptIds: string[],
  level: string,
  subject: string,
): string {
  return template
    .replace(/{LEVEL}/g, level)
    .replace(/{SUBJECT}/g, subject)
    .replace(/{CHAPTER_NUMBER}/g, String(chapter.chapterNumber))
    .replace(/{CHAPTER_TITLE}/g, chapter.chapterTitle)
    .replace(/{CHAPTER_TEXT}/g, chapterText)
    .replace(/{EXISTING_CONCEPTS}/g, existingConceptIds.join('\n'));
}

export async function extractConceptsFromChapter(
  llm: LlmProvider,
  chapter: ChapterChunk,
  existingConceptIds: string[],
  level: string,
  subject: string,
): Promise<ConceptCandidate[]> {
  const template = loadPromptTemplate();
  const textParts = prepareChapterText(chapter, TOKEN_LIMIT);
  const allConcepts: ConceptCandidate[] = [];

  for (const part of textParts) {
    const prompt = buildPrompt(template, chapter, part, existingConceptIds, level, subject);

    try {
      const result = await llm.generateStructured(prompt, conceptCandidateSchema, {
        temperature: 0.3,
      });

      for (const c of result.concepts) {
        allConcepts.push({
          chapterNumber: chapter.chapterNumber,
          chapterName: chapter.chapterTitle,
          conceptId: c.conceptId,
          learningObjective: c.learningObjective,
          coreIdea: c.coreIdea,
          examples: c.examples,
          misconceptions: c.misconceptions,
          suggestedDependencies: c.suggestedDependencies,
          sourceSections: c.sourceSections,
          supportingText: part,
          estimatedDuration: c.estimatedDuration,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to extract concepts from chapter ${chapter.chapterNumber} "${chapter.chapterTitle}": ${message}`,
      );
    }
  }

  return allConcepts;
}

export async function chunkContent(
  llm: LlmProvider,
  chapters: ChapterChunk[],
  existingConceptIds: string[],
  level: string,
  subject: string,
): Promise<ConceptCandidate[]> {
  const allCandidates: ConceptCandidate[] = [];

  for (const chapter of chapters) {
    const candidates = await extractConceptsFromChapter(
      llm,
      chapter,
      existingConceptIds,
      level,
      subject,
    );
    allCandidates.push(...candidates);
  }

  return allCandidates;
}

export async function chunkContentWithRouter(
  router: LlmRouter,
  chapters: ChapterChunk[],
): Promise<ConceptCandidate[]> {
  const allCandidates: ConceptCandidate[] = [];
  for (const chapter of chapters) {
    const candidates = await extractConceptsFromChapterWithRouter(router, chapter);
    allCandidates.push(...candidates);
  }
  return allCandidates;
}

async function extractConceptsFromChapterWithRouter(
  router: LlmRouter,
  chapter: ChapterChunk,
): Promise<ConceptCandidate[]> {
  const adapter = {
    async generateStructured<T>(prompt: string, schema: any, options?: any): Promise<T> {
      return router.generateStructuredRaw('concept_map', prompt, schema, options);
    },
  };
  return extractConceptsFromChapter(adapter, chapter, [], 'B', 'math');
}
