import { describe, it, expect } from 'vitest';
import { headingMatchScore, segmentChapters } from './segment.js';
import { detectTocPages, isTocPage, parsePageRange, parseTocEntries } from './toc.js';

describe('segmentChapters', () => {
  it('falls back to a single chapter when no chapter heading matches', () => {
    const markdown = '# Lesson 5: Fractions\n\n## Introduction\n\nA fraction is part of a whole.\n';
    const result = segmentChapters(markdown);
    expect(result.strategy).toBe('single');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]?.markdown).toContain('A fraction is part of a whole.');
  });

  it('splits on UNIT/CHAPTER/LESSON prefixes', () => {
    const markdown = [
      '# UNIT 1: NUMBERS',
      '',
      'Numbers are fun.',
      '',
      '# UNIT 2: SHAPES',
      '',
      'Shapes are everywhere.',
    ].join('\n');
    const result = segmentChapters(markdown);
    expect(result.strategy).toBe('heading');
    expect(result.chapters.map((chapter) => chapter.id)).toEqual([
      'unit-1-numbers',
      'unit-2-shapes',
    ]);
    expect(result.chapters[1]?.markdown).toContain('Shapes are everywhere.');
  });

  it('splits on all-caps H1 unit titles', () => {
    const markdown = [
      '# WRITING NUMBERS',
      '',
      'body one',
      '',
      '# ADDITION AND SUBTRACTION',
      '',
      'body two',
    ].join('\n');
    const result = segmentChapters(markdown);
    expect(result.strategy).toBe('heading');
    expect(result.chapters).toHaveLength(2);
  });

  it('honors an explicit chapter-heading regex', () => {
    const markdown = ['# Week 1', '', 'one', '', '# Week 2', '', 'two'].join('\n');
    const result = segmentChapters(markdown, { chapterHeading: /^Week \d+/ });
    expect(result.strategy).toBe('explicit');
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(['Week 1', 'Week 2']);
  });

  it('uses the table of contents when present', () => {
    const markdown = [
      '# CONTENTS',
      '',
      '1. Numbers 1',
      '2. Shapes 5',
      '',
      '# NUMBERS',
      '',
      'numbers body',
      '',
      '# SHAPES',
      '',
      'shapes body',
    ].join('\n');
    const result = segmentChapters(markdown);
    expect(result.strategy).toBe('toc');
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(['NUMBERS', 'SHAPES']);
  });

  it('maps a markdown table contents onto the chapter headings', () => {
    const markdown = [
      '# Contents',
      '',
      '| Sl. No. | Title of Lesson | Page No. |',
      '| :--- | :--- | :--- |',
      '| 1. | Numbers | 1 |',
      '| 2. | Addition and subtraction of numbers | 31 |',
      '',
      '# 1. NUMBERS',
      '',
      'numbers body',
      '',
      '# 2. ADDITION AND SUBTRACTION OF NUMBERS',
      '',
      '### We will learn in this lesson',
      '- Add numbers.',
      '',
      '#### Addition',
      '',
      'sub body',
    ].join('\n');
    const result = segmentChapters(markdown);
    expect(result.strategy).toBe('toc');
    expect(result.chapters.map((chapter) => chapter.id)).toEqual([
      '1-numbers',
      '2-addition-and-subtraction-of-numbers',
    ]);
    expect(result.chapters[1]?.markdown).toContain('### We will learn in this lesson');
  });

  it('carries page bounds when the markdown has form feeds', () => {
    const markdown = ['# UNIT 1', '', 'one', '\f', '# UNIT 2', '', 'two'].join('\n');
    const result = segmentChapters(markdown);
    expect(result.chapters[0]?.pageStart).toBe(1);
    expect(result.chapters[1]?.pageStart).toBe(2);
  });

  it('gives two chapters a stable sha256', () => {
    const markdown = '# UNIT 1\n\na\n\n# UNIT 2\n\nb';
    const first = segmentChapters(markdown);
    const second = segmentChapters(markdown);
    expect(first.chapters.map((chapter) => chapter.sha256)).toEqual(
      second.chapters.map((chapter) => chapter.sha256),
    );
  });
});

describe('headingMatchScore', () => {
  it('matches a truncated body heading with high score', () => {
    expect(
      headingMatchScore(
        'Reading, Understanding, Forming and Writing Numbers',
        'READING, UNDERSTANDING, FORMINGAND',
      ),
    ).toBeGreaterThanOrEqual(0.6);
  });

  it('scores an unrelated heading low', () => {
    expect(headingMatchScore('Multiplication', 'MEASUREMENT')).toBeLessThan(0.6);
  });

  it('does not let a shorter prefix heading outscore the full chapter heading', () => {
    expect(headingMatchScore('Addition and subtraction of numbers', 'Addition')).toBeLessThan(
      0.6,
    );
  });
});

describe('toc helpers', () => {
  it('detects a dense contents page', () => {
    const page = ['Contents', '1. Numbers 1', '2. Shapes 5', '3. Measurement 9'].join('\n');
    expect(isTocPage(page)).toBe(true);
    expect(detectTocPages(['cover', page])).toEqual([2]);
  });

  it('parses entries and strips page numbers', () => {
    expect(parseTocEntries('1. Numbers 1\n2. Shapes ..... 5')).toEqual(['Numbers', 'Shapes']);
  });

  it('parses a markdown table contents into entry titles', () => {
    const toc = [
      '| Sl. No. | Title of Lesson | Page No. |',
      '| :--- | :--- | :--- |',
      '| 1. | Reading Numbers | 1 |',
      '| | Assessment Sheet - 1 | |',
      '| 2. | Addition and subtraction of numbers | 31 |',
    ].join('\n');
    expect(parseTocEntries(toc)).toEqual([
      'Reading Numbers',
      'Assessment Sheet - 1',
      'Addition and subtraction of numbers',
    ]);
  });

  it('parses a page range', () => {
    expect(parsePageRange('12-14')).toEqual({ start: 12, end: 14 });
    expect(parsePageRange('bad')).toBeNull();
  });
});
