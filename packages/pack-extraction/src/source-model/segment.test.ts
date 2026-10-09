import { describe, it, expect } from 'vitest';
import { segmentMarkdown } from './segment.js';

const MULTI = `# LESSON ONE

## Learning Objectives

- recognise a shape
- name a shape

## Exercise

1. Draw a circle.

# LESSON TWO

## Learning Objectives

* count to ten

## Example

**Example 1:** one plus one is two.
`;

describe('segmentMarkdown', () => {
  it('splits on uppercase H1 lesson headings', () => {
    const lessons = segmentMarkdown(MULTI);
    expect(lessons.map((lesson) => lesson.title)).toEqual(['LESSON ONE', 'LESSON TWO']);
    expect(lessons[0]?.doc.sections[0]?.id).toBe('learning-objectives');
    expect(lessons[1]?.doc.sections[0]?.id).toBe('learning-objectives');
  });

  it('returns an empty array when no lesson heading matches', () => {
    expect(segmentMarkdown('# Lesson 5: Fractions\n\n## Introduction\n\nText.')).toEqual([]);
  });

  it('honors an explicit string-list matcher', () => {
    const markdown = '# Week 1\n\ntext\n\n# Week 2\n\nmore\n';
    const lessons = segmentMarkdown(markdown, { lessonHeading: ['Week 1', 'Week 2'] });
    expect(lessons.map((lesson) => lesson.title)).toEqual(['Week 1', 'Week 2']);
  });
});
