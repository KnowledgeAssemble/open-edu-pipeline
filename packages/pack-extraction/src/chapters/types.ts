export interface Chapter {
  id: string; // chapter slug, e.g. "unit-1-numbers"
  title: string;
  pageStart?: number;
  pageEnd?: number;
  sha256: string;
  markdown: string;
}

export interface ChaptersModel {
  chapters: Chapter[];
}

export type ChapterStrategy = 'toc' | 'heading' | 'explicit' | 'single';
