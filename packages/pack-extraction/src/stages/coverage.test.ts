import { describe, it, expect } from 'vitest';
import {
  LOW_COVERAGE_FLOOR,
  chapterCoverage,
  countStatedObjectives,
  excerptLineRange,
  excerptLineRanges,
  listItemsInRange,
  locateExcerpt,
  parseSections,
} from './coverage.js';

const BOOK = [
  '# Chapter 1 Whole Numbers',
  '',
  '### We will learn in this lesson',
  '- Read and write numbers.',
  '- Read place values of digits.',
  '  - (i) Place value of two digit numbers.',
  '  - (ii) Place value of three digit numbers.',
  '- Compare three digit numbers.',
  '',
  '### 1.1 Numbers around us',
  '',
  'Numbers are used everywhere.',
  '',
  '#### Remember',
  '',
  '- A one digit number is called ones or units.',
  '',
  '### 1.2 Expanded form',
  '',
  'In the number 65, place value of 6 is 60.',
  '',
  '### Let us Revise',
  '',
  'Addition of zero gives the same number.',
].join('\n');

describe('parseSections', () => {
  it('splits the chapter into heading blocks with ancestry', () => {
    const sections = parseSections(BOOK);
    const remember = sections.find((section) => section.title === 'Remember');
    expect(remember?.parentId).toBe(
      sections.find((section) => section.title === '1.1 Numbers around us')?.id,
    );
  });

  it('marks numbered sections as teaching sections only', () => {
    const sections = parseSections(BOOK);
    const teaching = sections.filter((section) => section.teaching).map((section) => section.title);
    expect(teaching).toEqual(['1.1 Numbers around us', '1.2 Expanded form']);
  });
});

describe('countStatedObjectives', () => {
  it('counts every stated objective bullet, nested bullets included', () => {
    expect(countStatedObjectives(BOOK)).toBe(5);
  });

  it('returns zero when the chapter states no objectives', () => {
    expect(countStatedObjectives('# Chapter\n\nSome prose.')).toBe(0);
  });

  it('stops a shallow objective block at the next heading', () => {
    const shallow = [
      '## Learning Objectives',
      '- recognise a fraction',
      '- identify the numerator',
      '',
      '### 1.1 Fractions around us',
      '',
      '- cut a cake into pieces',
      '- share it with friends',
      '',
      '### 1.2 Numerator and denominator',
      '',
      '- the top number is the numerator',
      '- the bottom number is the denominator',
    ].join('\n');
    expect(countStatedObjectives(shallow)).toBe(2);
  });

  it('counts sibling objective blocks once each', () => {
    const siblings = [
      '## Learning Objectives',
      '- one',
      '- two',
      '',
      '## Learning Outcomes',
      '- three',
      '- four',
    ].join('\n');
    expect(countStatedObjectives(siblings)).toBe(4);
  });

  it('counts legacy "Learning Objectives" bullet lists', () => {
    const legacy = [
      '## Learning Objectives',
      '',
      '* recognise a fraction',
      '* identify the numerator',
    ].join('\n');
    expect(countStatedObjectives(legacy)).toBe(2);
  });
});

describe('locateExcerpt', () => {
  it('finds the line of a verbatim excerpt', () => {
    expect(locateExcerpt(BOOK, 'A one digit number is called ones or units.')).toBe(15);
  });

  it('locates a rewritten excerpt through its longest verbatim prefix', () => {
    const line = locateExcerpt(
      BOOK,
      'In the number 65, place value of 6 is 60 and the place value of 5',
    );
    expect(line).toBe(19);
  });

  it('returns undefined for text that is not in the chapter', () => {
    expect(locateExcerpt(BOOK, 'completely absent text')).toBeUndefined();
  });
});

describe('excerptLineRange', () => {
  it('finds the lines an excerpt spans', () => {
    const range = excerptLineRange(
      BOOK,
      'Read place values of digits. (i) Place value of two digit numbers.',
    );
    expect(range?.start).toBe(4);
    expect(range?.end).toBe(5);
  });

  it('returns undefined for an excerpt that is not in the chapter', () => {
    expect(excerptLineRange(BOOK, 'completely absent text')).toBeUndefined();
  });

  it('lists every occurrence of a repeated excerpt', () => {
    const repeated = ['Read place values of digits.', '', '- Read place values of digits.'].join(
      '\n',
    );
    expect(excerptLineRanges(repeated, 'Read place values of digits.')).toHaveLength(2);
  });
});

describe('listItemsInRange', () => {
  it('lists the bullets of a range with their markers removed', () => {
    const range = excerptLineRange(BOOK, 'Read place values of digits.');
    expect(range).toBeDefined();
    expect(listItemsInRange(BOOK, range!.start, range!.end)).toEqual([
      'Read place values of digits.',
    ]);
  });

  it('lists nested bullets with their enumerator removed', () => {
    const range = excerptLineRange(BOOK, 'Place value of two digit numbers.');
    expect(range).toBeDefined();
    expect(listItemsInRange(BOOK, range!.start, range!.end)).toEqual([
      'Place value of two digit numbers.',
    ]);
  });

  it('removes lettered enumerators in both bracket styles', () => {
    const lines = ['- (a) alpha', '- a) alpha', '- a. alpha', '- (iv) alpha'].join('\n');
    expect(listItemsInRange(lines, 0, 3)).toEqual(['alpha', 'alpha', 'alpha', 'alpha']);
  });

  it('returns nothing for a range without bullets', () => {
    const range = excerptLineRange(BOOK, 'Numbers are used everywhere.');
    expect(range).toBeDefined();
    expect(listItemsInRange(BOOK, range!.start, range!.end)).toEqual([]);
  });
});

describe('chapterCoverage', () => {
  it('measures stated objectives, teaching sections and losses', () => {
    const report = chapterCoverage({
      markdown: BOOK,
      acceptedExcerpts: ['A one digit number is called ones or units.'],
      rejectedExcerpts: ['In the number 65, place value of 6 is 60 and the place value of 5'],
      extractedObjectives: 3,
    });

    expect(report.statedObjectives).toBe(5);
    expect(report.extractedObjectives).toBe(3);
    expect(report.objectiveGap).toBe(2);
    expect(report.teachingSections).toBe(2);
    expect(report.coveredSections).toBe(1);
    expect(report.uncoveredSections).toEqual(['1.2 Expanded form']);
    expect(report.lostSections).toEqual(['1.2 Expanded form']);
    expect(report.coverageRatio).toBe(0.5);
    expect(report.lowCoverage).toBe(false);
  });

  it('flags a chapter whose teaching sections are mostly uncovered', () => {
    const report = chapterCoverage({
      markdown: BOOK,
      acceptedExcerpts: [],
      rejectedExcerpts: [],
      extractedObjectives: 5,
    });
    expect(report.coverageRatio).toBe(0);
    expect(report.lowCoverage).toBe(true);
    expect(report.lowCoverage).toBe(report.coverageRatio < LOW_COVERAGE_FLOOR);
  });
});
