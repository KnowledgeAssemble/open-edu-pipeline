import { describe, it, expect } from 'vitest';
import {
  detectDocumentStructure,
  createSyntheticChapter,
  removeRepeatedHeaders,
} from '../detect.js';
import type { SourceTaxonomy } from '../../profile/types.js';

function makePage(text: string, pageNum: number) {
  return { text, pageNum };
}

const taxonomy: SourceTaxonomy = {
  lessonLabels: ['Lesson', 'Chapter'],
  sectionLabels: ['Section'],
  objectiveLabels: ['Objectives'],
  definitionLabels: ['Definition'],
  exampleLabels: ['Example'],
  exerciseLabels: ['Exercise'],
  reviewLabels: ['Review'],
  assessmentLabels: ['Assessment'],
};

describe('detectDocumentStructure', () => {
  it('detects Chapter 1: Introduction heading', () => {
    const pages = [makePage('Chapter 1: Introduction', 1)];
    const chapters = detectDocumentStructure(pages, taxonomy);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.id).toBe('chapter-1');
    expect(chapters[0]!.label).toBe('Introduction');
    expect(chapters[0]!.confidence).toBe(0.9);
  });

  it('detects Lesson 3: Fractions heading', () => {
    const pages = [makePage('Lesson 3: Fractions', 3)];
    const chapters = detectDocumentStructure(pages, taxonomy);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.label).toBe('Fractions');
  });

  it('detects all-caps BASIC ARITHMETIC OPERATIONS', () => {
    const pages = [makePage('BASIC ARITHMETIC OPERATIONS', 1)];
    const chapters = detectDocumentStructure(pages, taxonomy);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.confidence).toBe(0.6);
  });

  it('detects markdown heading', () => {
    const pages = [makePage('## Cell Biology', 1)];
    const chapters = detectDocumentStructure(pages, taxonomy);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.confidence).toBe(0.7);
  });

  it('detects NIOS heading with Hindi', () => {
    const niosTax: SourceTaxonomy = { ...taxonomy, lessonLabels: ['Lesson', 'पाठ'] };
    const pages = [makePage('पाठ 1: संख्याएं', 1)];
    const chapters = detectDocumentStructure(pages, niosTax);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.label).toBe('संख्याएं');
  });

  it('returns empty for single page with no heading', () => {
    const pages = [makePage('Just some text without any headings', 1)];
    const chapters = detectDocumentStructure(pages, taxonomy);
    expect(chapters).toHaveLength(0);
  });

  it('creates synthetic chapter for flat document', () => {
    const pages = [makePage('No headings here', 1)];
    const chapter = createSyntheticChapter(pages);
    expect(chapter.id).toBe('document-chapter-1');
    expect(chapter.confidence).toBe(0.5);
  });

  it('multi-chapter document preserves order', () => {
    const pages = [
      makePage('Chapter 1: First', 1),
      makePage('Some content', 2),
      makePage('Chapter 2: Second', 3),
      makePage('More content', 4),
    ];
    const chapters = detectDocumentStructure(pages, taxonomy);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.label).toBe('First');
    expect(chapters[1]!.label).toBe('Second');
  });

  it('confidence is always between 0 and 1', () => {
    const pages = [
      makePage('Chapter 1: Intro', 1),
      makePage('BASIC OPERATIONS', 2),
      makePage('## Markdown', 3),
      makePage('No heading', 4),
    ];
    const chapters = detectDocumentStructure(pages, taxonomy);
    for (const ch of chapters) {
      expect(ch.confidence).toBeGreaterThanOrEqual(0);
      expect(ch.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('removeRepeatedHeaders', () => {
  it('removes repeated first and last lines', () => {
    const pages = [
      makePage('Header\nSome content\nFooter', 1),
      makePage('Header\nDifferent content\nFooter', 2),
      makePage('Header\nMore content\nFooter', 3),
    ];
    const cleaned = removeRepeatedHeaders(pages);
    for (const page of cleaned) {
      expect(page.text).not.toContain('Header');
      expect(page.text).not.toContain('Footer');
    }
  });

  it('returns original if fewer pages than threshold', () => {
    const pages = [makePage('Header\nContent\nFooter', 1)];
    const cleaned = removeRepeatedHeaders(pages);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]!.text).toContain('Header');
  });
});
