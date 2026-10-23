import type { PageMap, PageWindow, ProofreadIssue } from './types.js';
import { normalizeWhitespace } from './util.js';

function overlapPages(pageMap: PageMap, startLine: number, endLine: number): number[] {
  return pageMap.pages
    .filter((page) => startLine <= page.endLine && endLine >= page.startLine)
    .map((page) => page.pageNum);
}

/**
 * Assign a page from the page map, never from the model. An issue that cannot be
 * tied to exactly one page is not auto-appliable; source-fidelity issues become
 * UNVERIFIABLE when the page is ambiguous.
 */
export function assignIssuePage(
  issue: ProofreadIssue,
  window: PageWindow,
  pageMap: PageMap,
): ProofreadIssue {
  if (!pageMap.available || pageMap.pages.length === 0) {
    return { ...issue, page: undefined, pageEnd: undefined };
  }

  const rawStart = issue.location.lineStart;
  const rawEnd = issue.location.lineEnd >= rawStart ? issue.location.lineEnd : rawStart;
  const startLine = Math.min(Math.max(rawStart, window.startLine), window.endLine);
  const endLine = Math.min(Math.max(rawEnd, startLine), window.endLine);
  const pages = [...new Set(overlapPages(pageMap, startLine, endLine))];

  let resolved: ProofreadIssue;
  if (pages.length === 1) {
    resolved = { ...issue, page: pages[0] };
  } else if (pages.length === 0 && window.pageNums.length === 1) {
    resolved = { ...issue, page: window.pageNums[0] };
  } else if (pages.length > 1) {
    resolved = { ...issue, page: pages[0], pageEnd: pages[pages.length - 1] };
    if (resolved.issueClass === 'source-fidelity') {
      resolved = {
        ...resolved,
        classification: 'UNVERIFIABLE',
        autoApplied: false,
      };
    }
  } else {
    resolved = { ...issue, page: undefined, pageEnd: undefined };
    if (resolved.issueClass === 'source-fidelity') {
      resolved = { ...resolved, classification: 'UNVERIFIABLE', autoApplied: false };
    }
  }

  return resolved;
}

function dedupeKey(issue: ProofreadIssue): string {
  const anchor = issue.patch?.exact ?? issue.markdownExcerpt;
  return [
    issue.page ?? 'no-page',
    issue.category,
    normalizeWhitespace(issue.finding).toLowerCase(),
    normalizeWhitespace(anchor).toLowerCase(),
  ].join('\u0000');
}

export function dedupeIssues(issues: ProofreadIssue[]): ProofreadIssue[] {
  const seen = new Set<string>();
  const result: ProofreadIssue[] = [];
  for (const issue of issues) {
    const key = dedupeKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

export function assignWindowIssues(
  issues: ProofreadIssue[],
  window: PageWindow,
  pageMap: PageMap,
): ProofreadIssue[] {
  return dedupeIssues(issues.map((issue) => assignIssuePage(issue, window, pageMap)));
}

export function sortIssues(issues: ProofreadIssue[]): ProofreadIssue[] {
  return [...issues].sort((a, b) => {
    const aPage = a.page ?? Number.MAX_SAFE_INTEGER;
    const bPage = b.page ?? Number.MAX_SAFE_INTEGER;
    if (aPage !== bPage) return aPage - bPage;
    if (a.location.lineStart !== b.location.lineStart) {
      return a.location.lineStart - b.location.lineStart;
    }
    return a.category.localeCompare(b.category);
  });
}
