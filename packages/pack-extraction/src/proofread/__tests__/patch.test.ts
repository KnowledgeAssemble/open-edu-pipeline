import { describe, expect, it } from 'vitest';
import {
  applyPatches,
  existingMarkerDeletePatches,
  pageMarkerPatches,
  patchWithinLimits,
  resolvePatch,
  reconstruct,
} from '../patch.js';
import type { PageMap, Patch } from '../types.js';

const RAW = ['alpha beta', 'repeat line', 'middle', 'repeat line', 'omega'].join('\n');

function mapOf(entries: Array<{ pageNum: number; startLine: number; endLine: number }>): PageMap {
  return {
    available: true,
    pdfSha256: 'pdf',
    rawMarkdownSha256: 'raw',
    liteparseVersion: 'test',
    pages: entries.map((entry) => ({
      ...entry,
      confidence: 'high',
      method: 'exact-anchor',
      referenceKind: 'text',
    })),
    unaligned: [],
    markerSkipped: [],
  };
}

describe('patch resolution and application', () => {
  it('uses context to select one repeated occurrence', () => {
    const patch: Patch = {
      op: 'replace',
      exact: 'repeat line',
      replacement: 'fixed line',
      before: 'alpha beta',
      after: '',
      origin: 'llm',
    };
    const resolved = resolvePatch(patch, RAW);
    expect(resolved.ok).toBe(true);
    const result = applyPatches(RAW, [patch]);
    expect(result.markdown).toBe(
      ['alpha beta', 'fixed line', 'middle', 'repeat line', 'omega'].join('\n'),
    );
    expect(result.records[0]?.status).toBe('applied');
  });

  it('rejects an anchor that is ambiguous without context', () => {
    const patch: Patch = {
      op: 'replace',
      exact: 'repeat line',
      replacement: 'fixed line',
      before: '',
      after: '',
      origin: 'llm',
    };
    const result = applyPatches(RAW, [patch]);
    expect(result.markdown).toBe(RAW);
    expect(result.records[0]).toMatchObject({ status: 'rejected' });
    expect(result.records[0]?.reason).toContain('ambiguous');
  });

  it('supports insert-before, insert-after, and delete', () => {
    const patches: Patch[] = [
      {
        op: 'insert-before',
        exact: 'middle',
        text: 'before\n',
        before: '',
        after: '',
        origin: 'llm',
      },
      {
        op: 'insert-after',
        exact: 'middle',
        text: '\nafter',
        before: '',
        after: '',
        origin: 'llm',
      },
      { op: 'delete', exact: 'omega', before: '', after: '', origin: 'llm' },
    ];
    const result = applyPatches(RAW, patches);
    expect(result.markdown).toBe(
      ['alpha beta', 'repeat line', 'before', 'middle', 'after', 'repeat line', ''].join('\n'),
    );
  });

  it('orders same-line inserts with page-map markers first', () => {
    const raw = 'Heading\nbody';
    const patches: Patch[] = [
      {
        op: 'insert-before',
        exact: 'Heading',
        text: 'llm note\n',
        before: '',
        after: '',
        origin: 'llm',
        order: 5,
      },
      {
        op: 'insert-before',
        exact: 'Heading',
        text: '<!-- pdf-page: 1 -->\n',
        before: '',
        after: '',
        origin: 'page-map',
        order: 1,
      },
    ];
    const result = applyPatches(raw, patches);
    expect(result.markdown).toBe('<!-- pdf-page: 1 -->\nllm note\nHeading\nbody');
    expect(result.records.filter((record) => record.status === 'applied')).toHaveLength(2);
  });

  it('rejects overlapping patches', () => {
    const patches: Patch[] = [
      {
        op: 'replace',
        exact: 'repeat line',
        replacement: 'one',
        before: 'alpha beta',
        after: '',
        origin: 'llm',
      },
      {
        op: 'replace',
        exact: 'repeat line',
        replacement: 'two',
        before: 'alpha beta',
        after: '',
        origin: 'llm',
      },
    ];
    const result = applyPatches(RAW, patches);
    expect(result.records.filter((record) => record.status === 'applied')).toHaveLength(1);
    expect(result.records.filter((record) => record.status === 'rejected')).toHaveLength(1);
  });

  it('enforces patch size limits', () => {
    expect(
      patchWithinLimits({
        op: 'replace',
        exact: 'x',
        replacement: 'y',
        before: '',
        after: '',
        origin: 'llm',
      }).ok,
    ).toBe(true);
    const big = 'x'.repeat(2_001);
    expect(
      patchWithinLimits({
        op: 'replace',
        exact: 'x',
        replacement: big,
        before: '',
        after: '',
        origin: 'llm',
      }).ok,
    ).toBe(false);
  });

  it('reconstructs the proofread Markdown from records', () => {
    const patch: Patch = {
      op: 'replace',
      exact: 'repeat line',
      replacement: 'fixed line',
      before: 'alpha beta',
      after: '',
      origin: 'llm',
    };
    const result = applyPatches(RAW, [patch]);
    expect(reconstruct(RAW, result.records)).toBe(result.markdown);
  });

  it('removes existing page markers and reinserts them at safe boundaries', () => {
    const raw = ['<!-- pdf-page: 1 -->', '# Title', '', 'Body text.', '', 'More body.'].join('\n');
    const pageMap = mapOf([
      { pageNum: 1, startLine: 2, endLine: 4 },
      { pageNum: 2, startLine: 6, endLine: 6 },
    ]);
    const insert = pageMarkerPatches(raw, pageMap);
    const deletes = existingMarkerDeletePatches(raw);
    const result = applyPatches(raw, [...deletes, ...insert.patches]);
    expect(result.markdown).toBe(
      [
        '<!-- pdf-page: 1 -->',
        '# Title',
        '',
        'Body text.',
        '',
        '<!-- pdf-page: 2 -->',
        'More body.',
      ].join('\n'),
    );
  });

  it('skips markers whose page starts mid-block', () => {
    const raw = '# Title\nBody starts here\ncontinued';
    const pageMap = mapOf([{ pageNum: 1, startLine: 2, endLine: 3 }]);
    const result = pageMarkerPatches(raw, pageMap);
    expect(result.patches).toEqual([]);
    expect(result.skipped).toEqual([1]);
  });
});
