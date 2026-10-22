import { describe, it, expect } from 'vitest';
import { applyMerge, buildMergePrompt, compactSummary } from './merge.js';
import type { VerifiedConcept } from './verify.js';

function concept(id: string, chapterId: string, title = id): VerifiedConcept {
  return {
    id,
    term: title,
    title,
    summary: `${title} summary`,
    excerpt: title,
    chapterId,
    origin: 'derived',
  };
}

const chapterText = new Map<string, string>([
  ['unit-1', '# Unit 1\n\nA fraction represents part of a whole.'],
  ['unit-2', '# Unit 2\n\nA numerator is the top number.'],
]);

describe('merge prompt payload', () => {
  it('carries the verbatim excerpt of every concept so evidence can be grounded', () => {
    const concepts = [concept('fraction', 'unit-1', 'Fraction')];
    const summary = compactSummary(concepts);
    expect(summary[0]?.excerpt).toBe('Fraction');
    expect(summary[0]?.chapterId).toBe('unit-1');
  });

  it('tells the model to copy evidence verbatim from the concept excerpt', () => {
    const prompt = buildMergePrompt(compactSummary([concept('fraction', 'unit-1', 'Fraction')]));
    expect(prompt).toContain('copied verbatim from the excerpt field');
    expect(prompt).toContain('Never paraphrase');
    expect(prompt).toContain('Fraction');
  });
});

describe('applyMerge', () => {
  it('keeps all concepts unchanged when nothing is merged', () => {
    const concepts = [concept('fraction', 'unit-1'), concept('numerator', 'unit-2')];
    const result = applyMerge({ concepts, result: undefined, chapterText });
    expect(result.concepts.map((c) => c.id)).toEqual(['fraction', 'numerator']);
    expect(result.prerequisites).toEqual([]);
    expect(result.mergeMap.clusters).toEqual([]);
  });

  it('merges duplicate clusters into the canonical id', () => {
    const concepts = [concept('fraction', 'unit-1'), concept('unit-2--fraction', 'unit-2')];
    const result = applyMerge({
      concepts,
      result: {
        duplicateClusters: [{ canonicalId: 'fraction', duplicateIds: ['unit-2--fraction'] }],
        prerequisiteLinks: [],
      },
      chapterText,
    });
    expect(result.concepts.map((c) => c.id)).toEqual(['fraction']);
    expect(result.mergeMap.clusters).toEqual([
      { canonicalId: 'fraction', mergedIds: ['unit-2--fraction'] },
    ]);
    expect(result.resolution.get('unit-2--fraction')).toBe('fraction');
  });

  it('keeps unresolved temporary ids under a stable finalized id', () => {
    const concepts = [concept('fraction', 'unit-1'), concept('unit-2--fraction', 'unit-2')];
    const result = applyMerge({ concepts, result: undefined, chapterText });
    expect(result.concepts.map((c) => c.id)).toEqual(['fraction', 'unit-2-fraction']);
    expect(result.mergeMap.finalized).toEqual([
      { originalId: 'unit-2--fraction', id: 'unit-2-fraction' },
    ]);
    expect([...result.unresolvedDuplicateIds]).toEqual(['unit-2-fraction']);
    expect(result.resolution.get('unit-2--fraction')).toBe('unit-2-fraction');
  });

  it('keeps grounded prerequisite links', () => {
    const concepts = [concept('fraction', 'unit-1'), concept('numerator', 'unit-2')];
    const result = applyMerge({
      concepts,
      result: {
        duplicateClusters: [],
        prerequisiteLinks: [
          {
            fromId: 'fraction',
            toId: 'numerator',
            evidenceExcerpt: 'A numerator is the top number.',
          },
        ],
      },
      chapterText,
    });
    expect(result.prerequisites).toEqual([{ fromId: 'fraction', toId: 'numerator' }]);
    expect(result.unresolvedPrereqs).toEqual([]);
  });

  it('drops ungrounded prerequisite evidence', () => {
    const concepts = [concept('fraction', 'unit-1'), concept('numerator', 'unit-2')];
    const result = applyMerge({
      concepts,
      result: {
        duplicateClusters: [],
        prerequisiteLinks: [
          { fromId: 'fraction', toId: 'numerator', evidenceExcerpt: 'invented evidence' },
        ],
      },
      chapterText,
    });
    expect(result.prerequisites).toEqual([]);
    expect(result.unresolvedPrereqs[0]?.reason).toBe('ungrounded-evidence');
  });

  it('breaks prerequisite cycles', () => {
    const concepts = [concept('a', 'unit-1'), concept('b', 'unit-2')];
    const result = applyMerge({
      concepts,
      result: {
        duplicateClusters: [],
        prerequisiteLinks: [
          { fromId: 'a', toId: 'b', evidenceExcerpt: 'part of a whole' },
          { fromId: 'b', toId: 'a', evidenceExcerpt: 'top number' },
        ],
      },
      chapterText,
    });
    expect(result.prerequisites).toEqual([{ fromId: 'a', toId: 'b' }]);
    expect(result.unresolvedPrereqs.some((item) => item.reason === 'cycle')).toBe(true);
  });

  it('reports unknown ids in clusters and links', () => {
    const concepts = [concept('fraction', 'unit-1')];
    const result = applyMerge({
      concepts,
      result: {
        duplicateClusters: [{ canonicalId: 'ghost', duplicateIds: ['fraction'] }],
        prerequisiteLinks: [
          { fromId: 'fraction', toId: 'ghost', evidenceExcerpt: 'part of a whole' },
        ],
      },
      chapterText,
    });
    expect(result.unresolvedPrereqs.some((item) => item.reason === 'unknown-id')).toBe(true);
  });
});
