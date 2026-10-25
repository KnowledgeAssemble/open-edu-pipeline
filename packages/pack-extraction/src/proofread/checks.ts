import type { DeterministicFinding, PageMap, PageReference, ProofreadIssue } from './types.js';
import { ProofreadIssueSchema } from './types.js';
import { normalizeWhitespace } from './util.js';

export interface DeterministicCheckOptions {
  assetPaths?: Set<string>;
}

function issue(
  partial: Omit<ProofreadIssue, 'markdownExcerpt'> & { markdownExcerpt?: string },
): ProofreadIssue {
  return ProofreadIssueSchema.parse({
    markdownExcerpt: '',
    deterministic: true,
    ...partial,
  });
}

function dedupe(findings: DeterministicFinding[]): DeterministicFinding[] {
  const seen = new Set<string>();
  const result: DeterministicFinding[] = [];
  for (const finding of findings) {
    const key = [
      finding.category,
      finding.classification,
      finding.location.lineStart,
      finding.location.lineEnd,
      finding.finding,
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }
  return result;
}

const FENCE = /^\s*(```|~~~)/;

function headingChecks(markdown: string, findings: ProofreadIssue[]): void {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let lastLevel = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const level = (match[1] ?? '').length;
    if (lastLevel > 0 && level > lastLevel + 1) {
      findings.push(
        issue({
          issueClass: 'markdown-validity',
          category: 'heading-hierarchy',
          classification: 'STRUCTURAL_ISSUE',
          finding: `Heading level jumps from H${lastLevel} to H${level}`,
          evidenceKind: 'markdown',
          evidence: line.trim().slice(0, 300),
          markdownExcerpt: line.trim().slice(0, 300),
          location: { heading: (match[2] ?? '').trim(), lineStart: index + 1, lineEnd: index + 1 },
          proposedAction: 'flag',
          confidence: 'high',
        }),
      );
    }
    lastLevel = level;
  }
}

function syntaxChecks(markdown: string, findings: ProofreadIssue[]): void {
  const lines = markdown.split(/\r?\n/);
  let fences = 0;
  let firstFenceLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (FENCE.test(lines[index] ?? '')) {
      if (fences === 0) firstFenceLine = index + 1;
      fences += 1;
    }
  }
  if (fences % 2 !== 0) {
    findings.push(
      issue({
        issueClass: 'markdown-validity',
        category: 'markdown-syntax',
        classification: 'STRUCTURAL_ISSUE',
        finding: 'Unbalanced fenced-code block',
        evidenceKind: 'markdown',
        evidence: lines[firstFenceLine - 1]?.trim() ?? '```',
        markdownExcerpt: lines[firstFenceLine - 1]?.trim() ?? '```',
        location: { lineStart: firstFenceLine, lineEnd: lines.length },
        proposedAction: 'flag',
        confidence: 'high',
      }),
    );
  }

  let dollarOpen = false;
  let dollarLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const stripped = line.replace(/\\\$/g, '');
    const count = (stripped.match(/\$\$/g) ?? []).length;
    if (count % 2 === 1) {
      dollarOpen = !dollarOpen;
      if (dollarOpen) dollarLine = index + 1;
    }
  }
  if (dollarOpen) {
    findings.push(
      issue({
        issueClass: 'markdown-validity',
        category: 'markdown-syntax',
        classification: 'STRUCTURAL_ISSUE',
        finding: 'Unclosed display-math delimiter ($$)',
        evidenceKind: 'markdown',
        evidence: lines[dollarLine - 1]?.trim() ?? '$$',
        markdownExcerpt: lines[dollarLine - 1]?.trim() ?? '$$',
        location: { lineStart: dollarLine, lineEnd: lines.length },
        proposedAction: 'flag',
        confidence: 'high',
      }),
    );
  }

  for (let index = 1; index < lines.length; index += 1) {
    const header = lines[index - 1] ?? '';
    const separator = lines[index] ?? '';
    if (!header.includes('|') || !/^\s*\|?[\s:|-]+\|?\s*$/.test(separator)) continue;
    const headerCells = header.split('|').length;
    const separatorCells = separator.split('|').length;
    if (Math.abs(headerCells - separatorCells) > 1) {
      findings.push(
        issue({
          issueClass: 'markdown-validity',
          category: 'table-structure',
          classification: 'STRUCTURAL_ISSUE',
          finding: 'Table separator does not match the header column count',
          evidenceKind: 'markdown',
          evidence: `${header.trim()}\n${separator.trim()}`.slice(0, 500),
          markdownExcerpt: `${header.trim()}\n${separator.trim()}`.slice(0, 500),
          location: { lineStart: index, lineEnd: index + 1 },
          proposedAction: 'flag',
          confidence: 'medium',
        }),
      );
    }
  }
}

function duplicateChecks(markdown: string, findings: ProofreadIssue[]): void {
  const lines = markdown.split(/\r?\n/);
  const seen = new Map<string, number>();
  let blockStart = 0;
  let block: string[] = [];
  const flush = (): void => {
    const text = block.join(' ').trim();
    const normalized = normalizeWhitespace(text).toLowerCase();
    if (normalized.length >= 40) {
      const previous = seen.get(normalized);
      if (previous !== undefined) {
        findings.push(
          issue({
            issueClass: 'markdown-validity',
            category: 'duplicated-content',
            classification: 'STRUCTURAL_ISSUE',
            finding: 'Paragraph repeats an earlier paragraph verbatim',
            evidenceKind: 'markdown',
            evidence: text.slice(0, 300),
            markdownExcerpt: text.slice(0, 300),
            location: { lineStart: blockStart + 1, lineEnd: blockStart + block.length },
            proposedAction: 'flag',
            confidence: 'medium',
          }),
        );
      } else {
        seen.set(normalized, blockStart + 1);
      }
    }
    block = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      flush();
      blockStart = index + 1;
    } else {
      if (block.length === 0) blockStart = index;
      block.push(line);
    }
  }
  flush();
}

function encodingChecks(markdown: string, findings: ProofreadIssue[]): void {
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.includes('\uFFFD')) {
      findings.push(
        issue({
          issueClass: 'markdown-validity',
          category: 'ocr-error',
          classification: 'STRUCTURAL_ISSUE',
          finding: 'Replacement character (U+FFFD) indicates failed decoding',
          evidenceKind: 'markdown',
          evidence: line.trim().slice(0, 200),
          markdownExcerpt: line.trim().slice(0, 200),
          location: { lineStart: index + 1, lineEnd: index + 1 },
          proposedAction: 'flag',
          confidence: 'high',
        }),
      );
    } else if (/[ÃÂâ€]/.test(line)) {
      findings.push(
        issue({
          issueClass: 'markdown-validity',
          category: 'ocr-error',
          classification: 'STRUCTURAL_ISSUE',
          finding: 'Possible mojibake or broken character encoding',
          evidenceKind: 'markdown',
          evidence: line.trim().slice(0, 200),
          markdownExcerpt: line.trim().slice(0, 200),
          location: { lineStart: index + 1, lineEnd: index + 1 },
          proposedAction: 'flag',
          confidence: 'medium',
        }),
      );
    }
  }
}

const ARITHMETIC =
  /(?<![\w.])(\d+(?:\.\d+)?)\s*([+\-*/×÷])\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)(?![\w.])/g;

function arithmeticChecks(markdown: string, findings: ProofreadIssue[]): void {
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    ARITHMETIC.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ARITHMETIC.exec(line)) !== null) {
      const left = Number.parseFloat(match[1] ?? '');
      const right = Number.parseFloat(match[3] ?? '');
      const stated = Number.parseFloat(match[4] ?? '');
      const operator = match[2] ?? '';
      if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(stated)) continue;
      let actual: number;
      switch (operator) {
        case '+':
          actual = left + right;
          break;
        case '-':
          actual = left - right;
          break;
        case '*':
        case '×':
          actual = left * right;
          break;
        case '/':
        case '÷':
          actual = right === 0 ? Number.NaN : left / right;
          break;
        default:
          continue;
      }
      if (!Number.isFinite(actual)) continue;
      if (Math.abs(actual - stated) <= 0.0001) continue;
      findings.push(
        issue({
          issueClass: 'source-error',
          category: 'numbers-dates-units',
          classification: 'POSSIBLE_SOURCE_ERROR',
          finding: `Printed arithmetic may be incorrect: ${match[0]} (computed ${actual})`,
          evidenceKind: 'markdown',
          evidence: match[0],
          markdownExcerpt: match[0],
          location: { lineStart: index + 1, lineEnd: index + 1 },
          proposedAction: 'flag',
          confidence: 'medium',
        }),
      );
    }
  }
}

function assetChecks(markdown: string, findings: ProofreadIssue[], assetPaths?: Set<string>): void {
  if (!assetPaths) return;
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const pattern = /!\[[^\]]*\]\((assets\/[^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const target = match[1] ?? '';
      if (assetPaths.has(target)) continue;
      findings.push(
        issue({
          issueClass: 'markdown-validity',
          category: 'missing-image-caption',
          classification: 'STRUCTURAL_ISSUE',
          finding: `Asset reference is missing from the asset set: ${target}`,
          evidenceKind: 'markdown',
          evidence: line.trim().slice(0, 300),
          markdownExcerpt: line.trim().slice(0, 300),
          location: { lineStart: index + 1, lineEnd: index + 1 },
          proposedAction: 'flag',
          confidence: 'high',
        }),
      );
    }
  }
}

/**
 * Zero-token validators over the whole Markdown document. Nothing here is ever
 * auto-fixed: findings are hints for the LLM and issues for the report.
 */
export function runDeterministicChecks(
  markdown: string,
  options: DeterministicCheckOptions = {},
): ProofreadIssue[] {
  const findings: ProofreadIssue[] = [];
  headingChecks(markdown, findings);
  syntaxChecks(markdown, findings);
  duplicateChecks(markdown, findings);
  encodingChecks(markdown, findings);
  arithmeticChecks(markdown, findings);
  assetChecks(markdown, findings, options.assetPaths);
  return dedupe(findings);
}

function anchorPresent(rawNormalized: string, anchor: string): boolean {
  const target = normalizeWhitespace(anchor).toLowerCase();
  if (target === '') return true;
  return rawNormalized.includes(target);
}

/**
 * Page coverage candidates derived from the reference bundle and page map.
 * These are hints only; a source-fidelity correction still needs LLM evidence.
 */
export function pageCoverageFindings(
  rawMarkdown: string,
  referencePages: PageReference[],
  pageMap: PageMap,
): ProofreadIssue[] {
  const findings: ProofreadIssue[] = [];
  const rawNormalized = normalizeWhitespace(rawMarkdown).toLowerCase();
  for (const page of referencePages) {
    if (page.text.trim() === '') continue;
    const entry = pageMap.pages.find((candidate) => candidate.pageNum === page.pageNum);
    if (!entry) continue;
    const lines = page.pageMarkdown.split(/\r?\n/).filter((line) => line.trim() !== '');
    const first = lines[0] ?? page.text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
    const last = lines[lines.length - 1] ?? '';
    if (first !== '' && !anchorPresent(rawNormalized, first)) {
      findings.push(
        issue({
          page: page.pageNum,
          issueClass: 'source-fidelity',
          category: 'missing-content',
          classification: 'UNVERIFIABLE',
          finding: 'Page start anchor is absent from the raw Markdown',
          evidenceKind: 'pdf-text',
          evidence: first.slice(0, 300),
          markdownExcerpt: '',
          location: { lineStart: entry.startLine, lineEnd: entry.endLine },
          proposedAction: 'flag',
          confidence: 'low',
        }),
      );
    }
    if (last !== '' && last !== first && !anchorPresent(rawNormalized, last)) {
      findings.push(
        issue({
          page: page.pageNum,
          issueClass: 'source-fidelity',
          category: 'missing-content',
          classification: 'UNVERIFIABLE',
          finding: 'Page end anchor is absent from the raw Markdown',
          evidenceKind: 'pdf-text',
          evidence: last.slice(0, 300),
          markdownExcerpt: '',
          location: { lineStart: entry.startLine, lineEnd: entry.endLine },
          proposedAction: 'flag',
          confidence: 'low',
        }),
      );
    }
  }
  return dedupe(findings);
}

/**
 * Running headers/footers are page chrome, not content. A short line repeated at
 * the start or end of at least three pages is reported for review, never patched.
 */
export function pageArtifactFindings(
  referencePages: PageReference[],
  pageMap: PageMap,
): ProofreadIssue[] {
  const findings: ProofreadIssue[] = [];
  const firstCounts = new Map<string, number[]>();
  const lastCounts = new Map<string, number[]>();
  const record = (map: Map<string, number[]>, line: string, page: number): void => {
    const normalized = normalizeWhitespace(line).toLowerCase();
    if (normalized === '' || normalized.length > 160 || normalized.startsWith('#')) return;
    const pages = map.get(normalized) ?? [];
    pages.push(page);
    map.set(normalized, pages);
  };
  for (const page of referencePages) {
    const lines = (page.pageMarkdown || page.text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (lines.length === 0) continue;
    record(firstCounts, lines[0] ?? '', page.pageNum);
    record(lastCounts, lines[lines.length - 1] ?? '', page.pageNum);
  }
  for (const [line, pages] of [...firstCounts, ...lastCounts]) {
    if (pages.length < 3) continue;
    const firstPage = pages[0] ?? 0;
    const entry = pageMap.pages.find((page) => page.pageNum === firstPage);
    findings.push(
      issue({
        page: firstPage,
        issueClass: 'source-fidelity',
        category: 'page-artifacts',
        classification: 'STRUCTURAL_ISSUE',
        finding: `Line repeats at a page boundary on ${pages.length} pages (possible running header/footer)`,
        evidenceKind: 'pdf-text',
        evidence: line.slice(0, 300),
        markdownExcerpt: '',
        location: {
          lineStart: entry?.startLine ?? 0,
          lineEnd: entry?.endLine ?? 0,
        },
        proposedAction: 'flag',
        confidence: 'medium',
      }),
    );
  }
  return dedupe(findings);
}
