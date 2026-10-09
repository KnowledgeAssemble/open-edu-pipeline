import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodIssue } from 'zod';
import { PackManifestSchema, ConceptSchema, CurriculumSchema } from '../schemas/index.js';
import type { Concept, ConceptRef } from '../schemas/index.js';

export type PackResult = { ok: true; report: string[] } | { ok: false; errors: string[] };

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function formatIssues(prefix: string, issues: ZodIssue[]): string[] {
  return issues.map((issue) => `${prefix}${issue.path.join('.')}: ${issue.message}`);
}

function detectCycles(concepts: Concept[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const concept of concepts) adjacency.set(concept.id, concept.prerequisites ?? []);

  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (id: string): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const nextState = state.get(next);
      if (nextState === 1) {
        const index = stack.indexOf(next);
        cycles.push([...stack.slice(index), next]);
      } else if (nextState === undefined && adjacency.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(id, 2);
  };

  for (const concept of concepts) {
    if (state.get(concept.id) === undefined) visit(concept.id);
  }

  return cycles;
}

export function validateKnowledgePack(kindDir: string): PackResult {
  const errors: string[] = [];
  const report: string[] = [];

  let manifestJson: unknown;
  let conceptsJson: unknown;
  try {
    manifestJson = readJson(join(kindDir, 'manifest.json'));
    conceptsJson = readJson(join(kindDir, 'concepts.json'));
  } catch (error) {
    return { ok: false, errors: [String(error)] };
  }

  const manifestResult = PackManifestSchema.safeParse(manifestJson);
  if (!manifestResult.success) {
    return { ok: false, errors: formatIssues('manifest.', manifestResult.error.issues) };
  }

  const conceptsResult = ConceptSchema.array().safeParse(conceptsJson);
  if (!conceptsResult.success) {
    return { ok: false, errors: formatIssues('concepts.', conceptsResult.error.issues) };
  }

  const manifest = manifestResult.data;
  const concepts = conceptsResult.data;
  report.push(`concepts: ${concepts.length}`);

  if (manifest.type !== 'knowledge') {
    errors.push('manifest: type must be knowledge');
  }

  const ids = new Set<string>();
  for (const concept of concepts) {
    if (ids.has(concept.id)) errors.push(`concept ${concept.id}: duplicate id`);
    ids.add(concept.id);
  }

  if (manifest.derivedFrom === 'document') {
    for (const concept of concepts) {
      if (concept.source) report.push(`concept ${concept.id}: source OK`);
      else errors.push(`concept ${concept.id}: source missing`);
    }
  }

  for (const concept of concepts) {
    for (const prerequisite of concept.prerequisites ?? []) {
      if (prerequisite === concept.id) {
        errors.push(`concept ${concept.id}: prerequisite self-reference`);
      } else if (!ids.has(prerequisite)) {
        errors.push(`concept ${concept.id}: prerequisite ${prerequisite} not found`);
      }
    }
  }

  for (const cycle of detectCycles(concepts)) {
    errors.push(`prerequisite cycle: ${cycle.join(' -> ')}`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, report };
}

export function validateCurriculumPack(
  kindDir: string,
  knowledgePackId: string,
  knowledgeConceptIds: Set<string>,
): PackResult {
  const errors: string[] = [];
  const report: string[] = [];

  let manifestJson: unknown;
  let curriculumJson: unknown;
  try {
    manifestJson = readJson(join(kindDir, 'manifest.json'));
    curriculumJson = readJson(join(kindDir, 'curriculum.json'));
  } catch (error) {
    return { ok: false, errors: [String(error)] };
  }

  const manifestResult = PackManifestSchema.safeParse(manifestJson);
  if (!manifestResult.success) {
    return { ok: false, errors: formatIssues('manifest.', manifestResult.error.issues) };
  }

  const curriculumResult = CurriculumSchema.safeParse(curriculumJson);
  if (!curriculumResult.success) {
    return { ok: false, errors: formatIssues('curriculum.', curriculumResult.error.issues) };
  }

  if (manifestResult.data.type !== 'curriculum') {
    errors.push('manifest: type must be curriculum');
  }

  const curriculum = curriculumResult.data;
  const unitIds = new Set(curriculum.units.map((unit) => unit.id));

  const checkRef = (ref: ConceptRef): void => {
    if (ref.pack !== knowledgePackId) {
      errors.push(
        `ref ${ref.concept} (${ref.pack}): unexpected pack (expected ${knowledgePackId})`,
      );
    } else if (knowledgeConceptIds.has(ref.concept)) {
      report.push(`ref ${ref.concept} (${ref.pack}): OK`);
    } else {
      errors.push(`ref ${ref.concept} (${ref.pack}): unknown concept`);
    }
  };

  for (const unit of curriculum.units) {
    for (const prerequisite of unit.prerequisites) {
      if (!unitIds.has(prerequisite)) {
        errors.push(`unit ${unit.id}: prerequisite ${prerequisite} not found`);
      }
    }
    for (const ref of unit.concepts) checkRef(ref);
    for (const objective of unit.objectives) {
      for (const ref of objective.concepts) checkRef(ref);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, report };
}
