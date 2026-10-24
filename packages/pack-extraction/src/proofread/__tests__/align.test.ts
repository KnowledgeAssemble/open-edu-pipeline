import { describe, expect, it } from 'vitest';
import { alignPages, pilotGate, unavailablePageMap } from '../align.js';
import { makePage, makeReference } from './fixtures.js';

const RAW = [
  '# Chapter One',
  '',
  'First page opening paragraph.',
  'First page closing paragraph.',
  '',
  'Second page opening.',
  'Second page closing.',
].join('\n');

describe('page alignment', () => {
  it('aligns exact unique anchors to monotonic line ranges', () => {
    const reference = makeReference([
      makePage(1, '# Chapter One\n\nFirst page opening paragraph.\nFirst page closing paragraph.'),
      makePage(2, 'Second page opening.\nSecond page closing.'),
    ]);
    const result = alignPages({ rawMarkdown: RAW, reference });
    expect(result.unaligned).toEqual([]);
    expect(result.pageMap.available).toBe(true);
    expect(result.pageMap.pages).toEqual([
      expect.objectContaining({ pageNum: 1, startLine: 1, endLine: 4, confidence: 'high' }),
      expect.objectContaining({ pageNum: 2, startLine: 6, endLine: 7, confidence: 'high' }),
    ]);
  });

  it('resolves normalized-whitespace anchors', () => {
    const raw = '# Title\n\nA  paragraph   with extra spaces.\n\nEnd.';
    const reference = makeReference([
      makePage(1, '# Title\n\nA paragraph with extra spaces.\n\nEnd.'),
    ]);
    const result = alignPages({ rawMarkdown: raw, reference });
    expect(result.pageMap.pages[0]).toMatchObject({
      pageNum: 1,
      startLine: 1,
      endLine: 5,
      confidence: 'high',
    });
  });

  it('marks pages unaligned when an anchor is missing', () => {
    const reference = makeReference([
      makePage(1, '# Chapter One\n\nFirst page opening paragraph.\nFirst page closing paragraph.'),
      makePage(2, 'Not in the markdown at all.\nAnother absent line.'),
    ]);
    const result = alignPages({ rawMarkdown: RAW, reference });
    expect(result.unaligned).toContain(2);
    expect(result.pageMap.pages).toHaveLength(1);
  });

  it('enforces monotonic ranges when a later page points backwards', () => {
    const reference = makeReference([
      makePage(1, 'Second page opening.'),
      makePage(2, '# Chapter One'),
    ]);
    const result = alignPages({ rawMarkdown: RAW, reference });
    expect(result.pageMap.pages[0]?.startLine).toBe(6);
    expect(result.unaligned).toContain(2);
  });

  it('reports an unavailable page map without a PDF', () => {
    const pageMap = unavailablePageMap(RAW);
    expect(pageMap.available).toBe(false);
    expect(pageMap.pages).toEqual([]);
    expect(pageMap.unaligned).toEqual([]);
  });

  it('passes and fails the pilot gate at the documented thresholds', () => {
    const good = alignPages({
      rawMarkdown: RAW,
      reference: makeReference([
        makePage(
          1,
          '# Chapter One\n\nFirst page opening paragraph.\nFirst page closing paragraph.',
        ),
        makePage(2, 'Second page opening.\nSecond page closing.'),
      ]),
    }).pageMap;
    expect(pilotGate(good).ok).toBe(true);

    const bad = alignPages({
      rawMarkdown: RAW,
      reference: makeReference([
        makePage(
          1,
          '# Chapter One\n\nFirst page opening paragraph.\nFirst page closing paragraph.',
        ),
        makePage(2, 'Missing page.'),
      ]),
    }).pageMap;
    expect(pilotGate(bad).ok).toBe(false);
  });
});
