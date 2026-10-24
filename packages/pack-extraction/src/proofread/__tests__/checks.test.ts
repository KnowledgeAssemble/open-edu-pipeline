import { describe, expect, it } from 'vitest';
import { runDeterministicChecks } from '../checks.js';

function categories(markdown: string): string[] {
  return runDeterministicChecks(markdown).map((issue) => issue.category);
}

describe('deterministic checks', () => {
  it('flags skipped heading levels', () => {
    const issues = runDeterministicChecks('# One\n\n### Three');
    expect(issues.some((issue) => issue.category === 'heading-hierarchy')).toBe(true);
  });

  it('flags unbalanced fences and display math', () => {
    expect(categories('```ts\nconst x = 1;')).toContain('markdown-syntax');
    expect(categories('$$x + 1')).toContain('markdown-syntax');
  });

  it('flags malformed table separators', () => {
    expect(categories('| a | b | c |\n| --- |')).toContain('table-structure');
  });

  it('flags duplicate paragraphs once', () => {
    const paragraph =
      'This is a sufficiently long paragraph that repeats verbatim in the document.';
    const issues = runDeterministicChecks(`${paragraph}\n\n${paragraph}`);
    expect(issues.filter((issue) => issue.category === 'duplicated-content')).toHaveLength(1);
  });

  it('flags replacement characters and mojibake', () => {
    expect(categories('broken \uFFFD text')).toContain('ocr-error');
    expect(categories('cafÃ©')).toContain('ocr-error');
  });

  it('flags incorrect literal arithmetic as a possible source error and never patches it', () => {
    const issues = runDeterministicChecks('2 + 2 = 5');
    const arithmetic = issues.find((issue) => issue.classification === 'POSSIBLE_SOURCE_ERROR');
    expect(arithmetic?.issueClass).toBe('source-error');
    expect(arithmetic?.patch).toBeUndefined();
    expect(categories('2 + 2 = 4')).not.toContain('numbers-dates-units');
  });

  it('flags missing asset references only when an asset set is supplied', () => {
    const markdown = '![figure](assets/missing.png)';
    expect(categories(markdown)).not.toContain('missing-image-caption');
    const issues = runDeterministicChecks(markdown, { assetPaths: new Set() });
    expect(issues.some((issue) => issue.category === 'missing-image-caption')).toBe(true);
  });
});
