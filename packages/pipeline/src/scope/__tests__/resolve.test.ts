import { describe, it, expect } from 'vitest';
import { parseScope, scopeToString } from '../types.js';
import { resolveScope } from '../resolve.js';
import type { SourceInventory } from '../../source/types.js';

function makeInventory(
  units: Array<{ id: string; type: string; pageStart: number; heading?: string }>,
): SourceInventory {
  return {
    documentId: 'test-doc',
    title: 'Test',
    totalPages: 20,
    units: units.map((u, _i) => ({
      id: u.id,
      type: u.type as any,
      text: `${u.type} content`,
      location: { pageStart: u.pageStart, heading: u.heading },
      extractionConfidence: 0.9,
      requiredCoverage: true,
    })),
    warnings: [],
  };
}

describe('parseScope', () => {
  it('parses all', () => {
    const s = parseScope('all');
    expect(s.kind).toBe('all');
  });

  it('parses chapter-index', () => {
    const s = parseScope('chapter-index:3');
    expect(s.kind).toBe('chapter-index');
    if (s.kind === 'chapter-index') expect(s.index).toBe(3);
  });

  it('parses chapter-id', () => {
    const s = parseScope('chapter-id:foo');
    expect(s.kind).toBe('chapter-id');
    if (s.kind === 'chapter-id') expect(s.id).toBe('foo');
  });

  it('parses pages', () => {
    const s = parseScope('pages:5-12');
    expect(s.kind).toBe('pages');
    if (s.kind === 'pages') {
      expect(s.start).toBe(5);
      expect(s.end).toBe(12);
    }
  });

  it('parses source-units', () => {
    const s = parseScope('source-units:src-1,src-5');
    expect(s.kind).toBe('source-units');
    if (s.kind === 'source-units') expect(s.ids).toEqual(['src-1', 'src-5']);
  });

  it('rejects invalid chapter index (0)', () => {
    expect(() => parseScope('chapter-index:0')).toThrow();
  });

  it('rejects invalid page range', () => {
    expect(() => parseScope('pages:5-3')).toThrow();
  });

  it('rejects empty chapter-id', () => {
    expect(() => parseScope('chapter-id:')).toThrow();
  });

  it('rejects empty source-units', () => {
    expect(() => parseScope('source-units:')).toThrow();
  });

  it('rejects unknown format', () => {
    expect(() => parseScope('unknown')).toThrow();
  });
});

describe('resolveScope', () => {
  const inventory = makeInventory([
    { id: 'l1', type: 'lesson', pageStart: 1, heading: 'Intro' },
    { id: 'o1', type: 'objective', pageStart: 1 },
    { id: 'd1', type: 'definition', pageStart: 2 },
    { id: 'e1', type: 'worked_example', pageStart: 3 },
    { id: 'l2', type: 'lesson', pageStart: 5, heading: 'Advanced' },
    { id: 'o2', type: 'objective', pageStart: 5 },
    { id: 'ex1', type: 'exercise', pageStart: 6 },
    { id: 'l3', type: 'lesson', pageStart: 10, heading: 'Summary' },
  ]);

  it('all mode returns all units', () => {
    const result = resolveScope({ kind: 'all' }, inventory);
    expect(result.filteredUnits).toHaveLength(8);
    expect(result.warnings).toEqual([]);
  });

  it('chapter-index filters correctly (1-based)', () => {
    const result = resolveScope({ kind: 'chapter-index', index: 2 }, inventory);
    // Chapter 2 starts at l2 (index 4) and ends before l3
    expect(result.filteredUnits.length).toBeGreaterThan(0);
    expect(result.filteredUnits[0]!.id).toBe('l2');
    expect(result.warnings).toEqual([]);
  });

  it('chapter-index out of range warns and returns all', () => {
    const result = resolveScope({ kind: 'chapter-index', index: 99 }, inventory);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.filteredUnits).toHaveLength(8);
  });

  it('chapter-id filters by ID match', () => {
    const result = resolveScope({ kind: 'chapter-id', id: 'l2' }, inventory);
    expect(result.filteredUnits.length).toBeGreaterThan(0);
    expect(result.filteredUnits[0]!.id).toBe('l2');
    expect(result.filteredUnits.every((u) => u.id === 'l2')).toBe(true);
  });

  it('chapter-id not found warns', () => {
    const result = resolveScope({ kind: 'chapter-id', id: 'nonexistent' }, inventory);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('pages mode filters by page range', () => {
    const result = resolveScope({ kind: 'pages', start: 5, end: 6 }, inventory);
    expect(result.filteredUnits.length).toBeGreaterThan(0);
    expect(
      result.filteredUnits.every((u) => u.location.pageStart >= 5 && u.location.pageStart <= 6),
    ).toBe(true);
  });

  it('source-units filters by IDs', () => {
    const result = resolveScope({ kind: 'source-units', ids: ['l1', 'e1'] }, inventory);
    expect(result.filteredUnits).toHaveLength(2);
    expect(result.filteredUnits.map((u) => u.id).sort()).toEqual(['e1', 'l1']);
  });

  it('source-units warns on unknown IDs', () => {
    const result = resolveScope({ kind: 'source-units', ids: ['l1', 'unknown'] }, inventory);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.filteredUnits).toHaveLength(1);
  });
});

describe('scopeToString', () => {
  it('round-trips with parseScope', () => {
    const scopes = [
      'all',
      'chapter-index:3',
      'chapter-id:foo',
      'pages:5-12',
      'source-units:src-1,src-5',
    ];
    for (const raw of scopes) {
      const parsed = parseScope(raw);
      expect(scopeToString(parsed)).toBe(raw);
    }
  });
});
