import type { ExtractionResult } from './types.js';
import type { PageContent } from '../source/inventory.js';

export function toPageContent(result: ExtractionResult): PageContent[] {
  const chunks = result.contentMd.split(/\f/);

  if (chunks.length <= 1) {
    return splitByParagraphs(result.contentMd);
  }

  const pages: PageContent[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i]!.trim();
    if (text.length > 0) {
      pages.push({ pageNum: i + 1, text });
    }
  }
  return pages;
}

function splitByParagraphs(content: string): PageContent[] {
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  if (paragraphs.length === 0) {
    return [{ pageNum: 1, text: content.trim() }];
  }

  const pages: PageContent[] = [];
  let pageNum = 1;
  let currentText = '';

  for (const para of paragraphs) {
    if (currentText.length + para.length > 2000 && currentText.length > 0) {
      pages.push({ pageNum, text: currentText.trim() });
      pageNum++;
      currentText = para;
    } else {
      currentText += (currentText ? '\n\n' : '') + para;
    }
  }

  if (currentText.trim().length > 0) {
    pages.push({ pageNum, text: currentText.trim() });
  }

  return pages;
}
