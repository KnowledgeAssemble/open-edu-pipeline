import type { SourceTaxonomy } from '../profile/types.js';
import type { ChapterStructure } from './types.js';

export interface PageContent {
  pageNum: number;
  text: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHeadingRegex(labels: string[], pattern: 'chapter' | 'section'): RegExp {
  const alternatives = labels.map(escapeRegex).join('|');
  if (pattern === 'chapter') {
    return new RegExp(`^(?:${alternatives})\\s+(\\d+)\\s*[:\\-\\u2013\\u2014]\\s*(.+)$`, 'im');
  }
  return new RegExp(`^(?:${alternatives})\\s*[:\\-\\u2013\\u2014]\\s*(.+)$`, 'im');
}

export function detectDocumentStructure(
  pages: PageContent[],
  taxonomy: SourceTaxonomy,
): ChapterStructure[] {
  const GENERIC_HEADING = /^(Chapter|Lesson|Unit|Module)\s+(\d+)\s*[:\-\u2013\u2014]\s*(.+)$/im;
  const ALL_CAPS = /^([A-Z][A-Z\s,]{10,})$/m;
  const MARKDOWN_H = /^#+\s+(.+)/m;

  const chapters: ChapterStructure[] = [];
  let currentChapter: ChapterStructure | null = null;
  let chapterCounter = 0;

  const chapterRegex = buildHeadingRegex(taxonomy.lessonLabels, 'chapter');

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const text = page.text.trim();

    let match = text.match(chapterRegex);
    if (!match) match = text.match(GENERIC_HEADING);

    if (!match) {
      const capsMatch = text.match(ALL_CAPS);
      if (capsMatch) {
        chapterCounter++;
        if (currentChapter) chapters.push(currentChapter);
        currentChapter = {
          id: `chapter-${chapterCounter}`,
          label: capsMatch[1]!.trim(),
          heading: capsMatch[0]!,
          pageStart: page.pageNum,
          pageEnd: page.pageNum,
          sections: [],
          confidence: 0.6,
        };
        continue;
      }
    }

    if (!match) {
      const mdMatch = text.match(MARKDOWN_H);
      if (mdMatch) {
        chapterCounter++;
        if (currentChapter) chapters.push(currentChapter);
        currentChapter = {
          id: `chapter-${chapterCounter}`,
          label: mdMatch[1]!.trim(),
          heading: mdMatch[0]!,
          pageStart: page.pageNum,
          pageEnd: page.pageNum,
          sections: [],
          confidence: 0.7,
        };
        continue;
      }
    }

    if (match) {
      chapterCounter++;
      if (currentChapter) {
        currentChapter.pageEnd = page.pageNum;
        chapters.push(currentChapter);
      }
      currentChapter = {
        id: `chapter-${chapterCounter}`,
        label: match[3]?.trim() || match[2]?.trim() || '',
        heading: match[0]!,
        pageStart: page.pageNum,
        pageEnd: page.pageNum,
        sections: [],
        confidence: 0.9,
      };
    }
  }

  if (currentChapter) {
    currentChapter.pageEnd = pages[pages.length - 1]?.pageNum || currentChapter.pageStart;
    chapters.push(currentChapter);
  }

  return chapters;
}

export function createSyntheticChapter(pages: PageContent[]): ChapterStructure {
  return {
    id: 'document-chapter-1',
    label: 'Document',
    heading: '',
    pageStart: pages[0]?.pageNum || 1,
    pageEnd: pages[pages.length - 1]?.pageNum || 1,
    sections: [],
    confidence: 0.5,
  };
}

export function removeRepeatedHeaders(pages: PageContent[], threshold: number = 3): PageContent[] {
  if (pages.length < threshold) return pages;

  const firstLines = pages.map((p) => p.text.split('\n')[0]?.trim() || '');
  const lastLines = pages.map((p) => {
    const lines = p.text.split('\n');
    return lines[lines.length - 1]?.trim() || '';
  });

  const firstLineCounts = new Map<string, number>();
  const lastLineCounts = new Map<string, number>();
  for (const line of firstLines) firstLineCounts.set(line, (firstLineCounts.get(line) || 0) + 1);
  for (const line of lastLines) lastLineCounts.set(line, (lastLineCounts.get(line) || 0) + 1);

  const repeatedFirsts = new Set(
    [...firstLineCounts].filter(([, c]) => c >= threshold).map(([l]) => l),
  );
  const repeatedLasts = new Set(
    [...lastLineCounts].filter(([, c]) => c >= threshold).map(([l]) => l),
  );

  return pages.map((p) => {
    const lines = p.text.split('\n');
    let trimmed = p.text;
    if (lines[0] && repeatedFirsts.has(lines[0].trim())) {
      trimmed = lines.slice(1).join('\n');
    }
    const newLines = trimmed.split('\n');
    if (newLines[newLines.length - 1] && repeatedLasts.has(newLines[newLines.length - 1]!.trim())) {
      trimmed = newLines.slice(0, -1).join('\n');
    }
    return { pageNum: p.pageNum, text: trimmed };
  });
}
