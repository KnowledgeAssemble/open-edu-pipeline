import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../index.js';

function prepareChapterTextLocal(
  chapter: {
    sections: { heading: string; body: string; examples: string[]; exercises: string[] }[];
  },
  maxTokens: number,
): string[] {
  const fullText = chapter.sections
    .map((s) => {
      let text = s.heading ? `${s.heading}\n` : '';
      text += s.body ? `${s.body}\n` : '';
      text += s.examples.length > 0 ? s.examples.map((e) => `  ${e}`).join('\n') + '\n' : '';
      text += s.exercises.length > 0 ? s.exercises.map((e) => `  ${e}`).join('\n') + '\n' : '';
      return text;
    })
    .join('\n');

  if (estimateTokens(fullText) <= maxTokens) {
    return [fullText];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  for (const section of chapter.sections) {
    const sectionText = [section.heading, section.body, ...section.examples, ...section.exercises]
      .filter(Boolean)
      .join('\n');

    if (estimateTokens(currentChunk + sectionText) > maxTokens && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sectionText;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + sectionText;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

describe('estimateTokens', () => {
  it('estimates tokens based on character count', () => {
    expect(estimateTokens('hello')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('rounds up', () => {
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('prepareChapterText', () => {
  it('returns single chunk if under token limit', () => {
    const chapter = {
      sections: [{ heading: '1.1 Intro', body: 'Short text', examples: [], exercises: [] }],
    };
    const result = prepareChapterTextLocal(chapter, 1000);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('1.1 Intro');
  });

  it('splits into multiple chunks when over limit', () => {
    const chapter = {
      sections: [
        { heading: '1.1 Intro', body: 'A'.repeat(100), examples: [], exercises: [] },
        { heading: '1.2 Details', body: 'B'.repeat(100), examples: [], exercises: [] },
      ],
    };
    const result = prepareChapterTextLocal(chapter, 10);
    expect(result.length).toBeGreaterThan(1);
  });

  it('includes examples and exercises in output', () => {
    const chapter = {
      sections: [
        { heading: '1.1', body: 'Body text', examples: ['Example 1'], exercises: ['Ex 1'] },
      ],
    };
    const result = prepareChapterTextLocal(chapter, 1000);
    expect(result[0]).toContain('Example 1');
    expect(result[0]).toContain('Ex 1');
  });
});
