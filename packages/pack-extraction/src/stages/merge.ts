import { z } from 'zod';
import type { VerifiedConcept } from './verify.js';
import { isGrounded } from './verify.js';
import { MERGE_PROMPT_VERSION, MERGE_SCHEMA_VERSION } from './extract.js';

export { MERGE_PROMPT_VERSION, MERGE_SCHEMA_VERSION };

export const MergeResultSchema = z.object({
  duplicateClusters: z.array(
    z.object({
      canonicalId: z.string(),
      duplicateIds: z.array(z.string()),
    }),
  ),
  prerequisiteLinks: z.array(
    z.object({
      fromId: z.string(),
      toId: z.string(),
      evidenceExcerpt: z.string(),
    }),
  ),
});

export type MergeResult = z.infer<typeof MergeResultSchema>;

export interface MergeConceptSummary {
  id: string;
  title: string;
  summary: string;
  /** Verbatim chapter text the concept was extracted from. */
  excerpt: string;
  chapterId: string;
}

export interface MergeMap {
  clusters: Array<{ canonicalId: string; mergedIds: string[] }>;
  finalized: Array<{ originalId: string; id: string }>;
}

export interface UnresolvedPrereq {
  fromId: string;
  toId: string;
  reason: string;
  evidenceExcerpt?: string;
}

export interface MergeApplyInput {
  concepts: VerifiedConcept[];
  result: MergeResult | undefined;
  chapterText: Map<string, string>;
}

export interface MergeApplyResult {
  concepts: VerifiedConcept[];
  prerequisites: Array<{ fromId: string; toId: string }>;
  mergeMap: MergeMap;
  unresolvedPrereqs: UnresolvedPrereq[];
  resolution: Map<string, string>;
  /** Final ids for unresolved duplicates (kept in the knowledge pack, excluded from curriculum). */
  unresolvedDuplicateIds: Set<string>;
}

/** Excerpt chars kept in the merge payload: enough for a verbatim evidence quote,
 *  bounded so a full-book merge prompt stays inside the model's context. */
const MERGE_EXCERPT_CHARS = 300;

export function compactSummary(concepts: VerifiedConcept[]): MergeConceptSummary[] {
  return concepts.map((concept) => ({
    id: concept.id,
    title: concept.title,
    summary: concept.summary.slice(0, 200),
    excerpt: concept.excerpt.slice(0, MERGE_EXCERPT_CHARS),
    chapterId: concept.chapterId,
  }));
}

export function buildMergePrompt(concepts: MergeConceptSummary[]): string {
  return [
    'You compare concepts extracted from a whole book and return JSON only.',
    'Two tasks:',
    '1. duplicateClusters: groups of ids that name the same concept; pick one canonicalId.',
    '2. prerequisiteLinks: cross-chapter links { fromId, toId, evidenceExcerpt } where toId must be understood before fromId.',
    'evidenceExcerpt MUST be copied verbatim from the excerpt field of the fromId or toId concept (that field is the verbatim chapter text). Never paraphrase, summarize, or rewrite it.',
    'Never invent ids that are not in the list. Empty arrays are valid.',
    '',
    JSON.stringify({ concepts }),
  ].join('\n');
}

function createsCycle(edges: Map<string, Set<string>>, from: string, to: string): boolean {
  const stack = [to];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) ?? []) stack.push(next);
  }
  return false;
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base || 'concept';
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

export function applyMerge(input: MergeApplyInput): MergeApplyResult {
  const byId = new Map(input.concepts.map((concept) => [concept.id, concept]));
  const mergeMap: MergeMap = { clusters: [], finalized: [] };
  const unresolvedPrereqs: UnresolvedPrereq[] = [];
  const redirect = new Map<string, string>();

  if (input.result) {
    for (const cluster of input.result.duplicateClusters) {
      const canonicalId = cluster.canonicalId;
      if (!byId.has(canonicalId)) {
        for (const duplicate of cluster.duplicateIds) {
          unresolvedPrereqs.push({ fromId: duplicate, toId: canonicalId, reason: 'unknown-id' });
        }
        continue;
      }
      const mergedIds: string[] = [];
      for (const duplicate of cluster.duplicateIds) {
        if (duplicate === canonicalId || redirect.has(duplicate)) continue;
        if (!byId.has(duplicate)) {
          unresolvedPrereqs.push({ fromId: duplicate, toId: canonicalId, reason: 'unknown-id' });
          continue;
        }
        redirect.set(duplicate, canonicalId);
        mergedIds.push(duplicate);
      }
      if (mergedIds.length > 0) mergeMap.clusters.push({ canonicalId, mergedIds });
    }
  }

  const resolveCluster = (id: string): string => {
    let current = id;
    const seen = new Set<string>();
    while (redirect.has(current) && !seen.has(current)) {
      seen.add(current);
      current = redirect.get(current) as string;
    }
    return current;
  };

  // Finalize ids. Duplicates the model clustered collapse into their canonical id;
  // unresolved temporary ids (chapter-scoped duplicates the merge missed) are KEPT
  // under a stable, pack-legal id rather than silently dropped.
  const used = new Set<string>();
  const resolution = new Map<string, string>();
  const unresolvedDuplicateIds = new Set<string>();
  const concepts: VerifiedConcept[] = [];
  const ordered = [
    ...input.concepts.filter((concept) => !concept.id.includes('--')),
    ...input.concepts.filter((concept) => concept.id.includes('--')),
  ];
  for (const concept of ordered) {
    const canonical = resolveCluster(concept.id);
    if (canonical !== concept.id) {
      resolution.set(concept.id, canonical);
      continue;
    }
    if (concept.id.includes('--')) {
      const id = uniqueId(concept.id.replace(/--+/g, '-'), used);
      mergeMap.finalized.push({ originalId: concept.id, id });
      unresolvedDuplicateIds.add(id);
      resolution.set(concept.id, id);
      concepts.push({ ...concept, id });
    } else {
      const id = uniqueId(concept.id, used);
      resolution.set(concept.id, id);
      concepts.push(id === concept.id ? concept : { ...concept, id });
    }
  }

  const finalById = new Map(concepts.map((concept) => [concept.id, concept]));
  const idSet = new Set(finalById.keys());
  const resolveFinal = (id: string): string => resolution.get(id) ?? resolveCluster(id);

  const edges = new Map<string, Set<string>>();
  const prerequisites: Array<{ fromId: string; toId: string }> = [];
  const seenEdges = new Set<string>();

  if (input.result) {
    for (const link of input.result.prerequisiteLinks) {
      const fromId = resolveFinal(link.fromId);
      const toId = resolveFinal(link.toId);
      if (!idSet.has(fromId) || !idSet.has(toId)) {
        unresolvedPrereqs.push({
          fromId: link.fromId,
          toId: link.toId,
          reason: 'unknown-id',
          evidenceExcerpt: link.evidenceExcerpt,
        });
        continue;
      }
      if (fromId === toId) {
        unresolvedPrereqs.push({
          fromId: link.fromId,
          toId: link.toId,
          reason: 'self-reference',
          evidenceExcerpt: link.evidenceExcerpt,
        });
        continue;
      }
      const fromChapter = finalById.get(fromId)?.chapterId;
      const toChapter = finalById.get(toId)?.chapterId;
      const grounded = [fromChapter, toChapter].some((chapterId) => {
        if (!chapterId) return false;
        const text = input.chapterText.get(chapterId);
        return text !== undefined && isGrounded(link.evidenceExcerpt, text);
      });
      if (!grounded) {
        unresolvedPrereqs.push({
          fromId: link.fromId,
          toId: link.toId,
          reason: 'ungrounded-evidence',
          evidenceExcerpt: link.evidenceExcerpt,
        });
        continue;
      }
      const key = `${fromId}\u0000${toId}`;
      if (seenEdges.has(key)) continue;
      const existing = edges.get(fromId) ?? new Set<string>();
      if (createsCycle(edges, fromId, toId)) {
        unresolvedPrereqs.push({
          fromId,
          toId,
          reason: 'cycle',
          evidenceExcerpt: link.evidenceExcerpt,
        });
        continue;
      }
      existing.add(toId);
      edges.set(fromId, existing);
      seenEdges.add(key);
      prerequisites.push({ fromId, toId });
    }
  }

  return {
    concepts,
    prerequisites,
    mergeMap,
    unresolvedPrereqs,
    resolution,
    unresolvedDuplicateIds,
  };
}
