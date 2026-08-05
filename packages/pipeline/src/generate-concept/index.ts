import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LlmProvider, LlmRouter } from '@open-edu/pipeline-llm';
import type { ConceptCandidate, GeneratedConcept } from '../types.js';
import { ConceptRegistry } from './concept-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const enrichedConceptSchema = z.object({
  concepts: z.array(
    z.object({
      conceptId: z.string(),
      masteryCriteria: z.number().min(0).max(1),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
      supports: z.object({ visual: z.boolean() }),
      dependencies: z.array(z.string()),
      misconceptions: z.array(z.string()).max(3),
      chapterCode: z.string(),
      chapterName: z.string(),
    }),
  ),
});

function loadPromptTemplate(): string {
  const promptPath = join(__dirname, 'prompts', 'enrich-concept.txt');
  return readFileSync(promptPath, 'utf-8');
}

function buildPrompt(
  template: string,
  candidate: ConceptCandidate,
  knownConceptIds: string[],
  level: string,
  subject: string,
): string {
  return template
    .replace(/{LEVEL}/g, level)
    .replace(/{SUBJECT}/g, subject)
    .replace(/{CONCEPT_ID}/g, candidate.conceptId)
    .replace(/{LEARNING_OBJECTIVE}/g, candidate.learningObjective)
    .replace(/{CORE_IDEA}/g, candidate.coreIdea)
    .replace(/{EXAMPLES}/g, candidate.examples.map((e) => `  - ${e}`).join('\n'))
    .replace(/{SOURCE_TEXT}/g, candidate.supportingText.slice(0, 2000))
    .replace(/{KNOWN_CONCEPTS}/g, knownConceptIds.join('\n'));
}

export async function generateConcepts(
  llm: LlmProvider,
  candidates: ConceptCandidate[],
  levelAConceptIds: string[],
  level: string,
  subject: string,
): Promise<{ concepts: GeneratedConcept[]; warnings: string[] }> {
  const template = loadPromptTemplate();
  const registry = new ConceptRegistry(levelAConceptIds);
  const concepts: GeneratedConcept[] = [];
  const warnings: string[] = [];

  const BATCH_SIZE = 1;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const knownIds = registry.getAllIds();

    try {
      const prompt = buildPrompt(template, batch[0]!, knownIds, level, subject);
      const additionalContext = batch
        .slice(1)
        .map(
          (c) =>
            `\n---\nAdditional Candidate:\n- conceptId: ${c.conceptId}\n- Learning Objective: ${c.learningObjective}\n- Core Idea: ${c.coreIdea}`,
        )
        .join('');

      const result = await llm.generateStructured(
        prompt + additionalContext,
        enrichedConceptSchema,
        { temperature: 0.3 },
      );

      for (const enriched of result.concepts) {
        const candidate = batch.find((c) => c.conceptId === enriched.conceptId);
        if (!candidate) {
          warnings.push(`Generated concept ${enriched.conceptId} has no matching candidate`);
          continue;
        }

        const { valid, missing } = registry.validateDependencies(enriched.dependencies);
        if (missing.length > 0) {
          warnings.push(
            `Concept ${enriched.conceptId}: removing unresolvable dependencies: ${missing.join(', ')}`,
          );
        }

        const concept: GeneratedConcept = {
          conceptId: enriched.conceptId,
          chapterCode: enriched.chapterCode,
          chapterName: enriched.chapterName,
          learningObjective: candidate.learningObjective,
          coreIdea: candidate.coreIdea,
          examples: candidate.examples,
          misconceptions: enriched.misconceptions,
          supports: enriched.supports,
          masteryCriteria: enriched.masteryCriteria,
          difficulty: enriched.difficulty,
          estimatedDuration: candidate.estimatedDuration,
          dependencies: valid,
        };

        registry.register(enriched.conceptId);
        concepts.push(concept);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to enrich concepts in batch starting at index ${i}: ${message}`);
    }
  }

  return { concepts, warnings };
}

export async function enrichConceptsWithRouter(
  router: LlmRouter,
  candidates: ConceptCandidate[],
): Promise<{ concepts: GeneratedConcept[]; warnings: string[] }> {
  const adapter = {
    async generateStructured<T>(prompt: string, schema: any, options?: any): Promise<T> {
      return router.generateStructuredRaw('concept_enrichment', prompt, schema, options);
    },
  };
  return generateConcepts(adapter, candidates, [], 'B', 'math');
}
