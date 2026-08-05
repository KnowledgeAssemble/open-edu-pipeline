import type { LlmRouter } from '@open-edu/pipeline-llm';
import type { SourceUnit } from '../source/types.js';
import type { CurriculumProfile } from '../profile/types.js';
import type { Concept } from './types.js';
import { ConceptSchema, ConceptMapResponseSchema } from './types.js';
import { buildConceptMapPrompt } from './prompt.js';

function normalizeDifficulty(raw: string): 'beginner' | 'intermediate' | 'advanced' {
  const lower = raw.toLowerCase();
  if (lower === 'easy' || lower === 'basic') return 'beginner';
  if (lower === 'medium' || lower === 'moderate') return 'intermediate';
  if (lower === 'hard' || lower === 'difficult' || lower === 'advanced') return 'advanced';
  return 'intermediate';
}

function normalizeConcept(raw: Record<string, unknown>): Concept {
  return {
    conceptId: (raw.conceptId as string) || 'unknown',
    label: (raw.label as string) || 'Untitled',
    kind: (raw.kind as Concept['kind']) || 'knowledge',
    sourceUnitIds: Array.isArray(raw.sourceUnitIds) ? (raw.sourceUnitIds as string[]) : [],
    learningObjective: (raw.learningObjective as string) || 'No objective provided',
    coreIdea: (raw.coreIdea as string) || 'No core idea provided',
    difficulty: normalizeDifficulty((raw.difficulty as string) || ''),
    masteryThreshold:
      typeof raw.masteryThreshold === 'number'
        ? Math.min(Math.max(raw.masteryThreshold, 0.5), 1)
        : 0.8,
    prerequisites: Array.isArray(raw.prerequisites) ? (raw.prerequisites as string[]) : [],
    representations: (Array.isArray(raw.representations)
      ? (raw.representations as string[]).filter((r) =>
          ['concrete', 'visual', 'symbolic'].includes(r),
        )
      : ['visual']) as Concept['representations'],
    exerciseFamilies: Array.isArray(raw.exerciseFamilies)
      ? (raw.exerciseFamilies as string[])
      : ['direct_question'],
    misconceptionTargets: Array.isArray(raw.misconceptionTargets)
      ? (raw.misconceptionTargets as string[])
      : [],
    adultContext: typeof raw.adultContext === 'string' ? raw.adultContext : null,
    recommendedWidgetCategories: Array.isArray(raw.recommendedWidgetCategories)
      ? (raw.recommendedWidgetCategories as string[])
      : [],
    estimatedMinutes:
      typeof raw.estimatedMinutes === 'number'
        ? Math.min(Math.max(raw.estimatedMinutes, 5), 60)
        : 15,
    extensions: (raw.extensions as Record<string, unknown>) || undefined,
  };
}

export function validateConceptGraph(concepts: Concept[]): string[] {
  const errors: string[] = [];
  const ids = new Set(concepts.map((c) => c.conceptId));

  for (const concept of concepts) {
    const prereqs = concept.prerequisites ?? [];
    if (prereqs.includes(concept.conceptId)) {
      errors.push(`Concept "${concept.conceptId}" lists itself as a prerequisite`);
    }
    for (const prereq of prereqs) {
      if (!ids.has(prereq)) {
        errors.push(`Concept "${concept.conceptId}" references unknown prerequisite "${prereq}"`);
      }
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const c of concepts) adj.set(c.conceptId, c.prerequisites ?? []);

  function detectCycle(nodeId: string): boolean {
    if (inStack.has(nodeId)) {
      errors.push(`Dependency cycle detected via "${nodeId}"`);
      return true;
    }
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const dep of adj.get(nodeId) || []) detectCycle(dep);
    inStack.delete(nodeId);
    return false;
  }
  for (const c of concepts) detectCycle(c.conceptId);

  for (const c of concepts) {
    if (c.sourceUnitIds.length === 0)
      errors.push(`Concept "${c.conceptId}" has no source evidence`);
  }

  return errors;
}

export async function generateConceptMap(
  router: LlmRouter,
  sourceUnits: SourceUnit[],
  lessonName: string,
  profile: CurriculumProfile,
): Promise<{ concepts: Concept[]; warnings: string[] }> {
  const prompt = buildConceptMapPrompt(sourceUnits, lessonName, profile);
  const result = await router.generateStructuredRaw(
    'concept_map',
    prompt,
    ConceptMapResponseSchema,
    {
      temperature: 0.2,
    },
  );

  const warnings: string[] = [];

  const normalized: Concept[] = [];
  for (const raw of result.concepts) {
    const concept = normalizeConcept(raw);
    const parsed = ConceptSchema.safeParse(concept);
    if (!parsed.success) {
      warnings.push(`Concept "${concept.conceptId}" failed validation: ${parsed.error.message}`);
      continue;
    }
    normalized.push(parsed.data);
  }

  const graphErrors = validateConceptGraph(normalized);
  if (graphErrors.length > 0) warnings.push(...graphErrors);

  for (const c of normalized) {
    if (!profile.conceptKinds.includes(c.kind)) {
      warnings.push(
        `Concept "${c.conceptId}" uses unsupported kind "${c.kind}" for profile "${profile.id}"`,
      );
    }
    for (const rep of c.representations) {
      if (!profile.representations.includes(rep)) {
        warnings.push(
          `Concept "${c.conceptId}" uses unsupported representation "${rep}" for profile "${profile.id}"`,
        );
      }
    }
  }

  return { concepts: normalized, warnings };
}
