import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FakeProofreadClient } from '../fake.js';
import { runProofread } from '../orchestrate.js';
import { reconstruct } from '../patch.js';
import type { PageReview, ProofreadIssue } from '../types.js';
import { ProofreadIssueSchema } from '../types.js';
import { makePage, makeReference } from './fixtures.js';

const P1 =
  'Page one text with a typo. ' +
  'Ordinary prose continues here without any visual signal. '.repeat(6);
const P2 =
  'Page two text. ' + 'A second prose paragraph continues without visual signals. '.repeat(6);
const P3 =
  'Page three text. ' + 'A third prose paragraph continues without visual signals. '.repeat(6);

const RAW = ['# Chapter One', '', P1, '', P2, '', P3].join('\n');

const reference = makeReference([
  makePage(1, `# Chapter One\n\n${P1}`),
  makePage(2, P2),
  makePage(3, P3),
]);

const dirs: string[] = [];

function tempWorkdir(): { dir: string; reviewDir: string; proofreadPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'proofread-run-'));
  dirs.push(dir);
  return {
    dir,
    reviewDir: join(dir, 'review', 'proofread'),
    proofreadPath: join(dir, 'source', 'book.proofread.md'),
  };
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function issue(): ProofreadIssue {
  return ProofreadIssueSchema.parse({
    page: 99,
    issueClass: 'source-fidelity',
    category: 'punctuation',
    classification: 'CONVERSION_ERROR',
    finding: 'Converted phrase differs from the page',
    evidenceKind: 'pdf-text',
    evidence: 'Page one text with a typo.',
    markdownExcerpt: 'Page one text with a typo.',
    location: { lineStart: 3, lineEnd: 3 },
    proposedAction: 'replace',
    patch: {
      op: 'replace',
      exact: 'with a typo',
      replacement: 'with a term',
      before: '',
      after: '',
      origin: 'llm',
    },
    confidence: 'high',
  });
}

function review(pageNums: number[]): PageReview {
  return {
    pages: pageNums,
    pagePresence: pageNums.map((pageNum) => ({ pageNum, status: 'present' as const })),
    issues: pageNums.includes(1) ? [issue()] : [],
  };
}

function fakeClient(): FakeProofreadClient {
  return new FakeProofreadClient({
    review: ({ window }) => review(window.pageNums),
  });
}

function commonOptions(work: ReturnType<typeof tempWorkdir>) {
  return {
    documentId: 'book',
    markdown: RAW,
    title: 'Book',
    workingDir: work.dir,
    reviewDir: work.reviewDir,
    proofreadMarkdownPath: work.proofreadPath,
    reference,
    reviewClient: fakeClient(),
    verifierClient: new FakeProofreadClient(),
    budgetUsd: 1,
  };
}

describe('runProofread integration', () => {
  it('applies only verified high-confidence conversion errors and resolves pages', async () => {
    const work = tempWorkdir();
    const result = await runProofread(commonOptions(work));

    expect(result.status).toBe('PASS_WITH_WARNINGS');
    expect(result.inspectedPages).toEqual([1, 2, 3]);
    expect(result.pageMap.pages.map((page) => page.pageNum)).toEqual([1, 2, 3]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      id: 'P001',
      page: 1,
      autoApplied: true,
      verification: 'accepted',
    });
    expect(result.proofreadMarkdown).toContain('Page one text with a term.');
    expect(result.selectedMarkdown).toContain('Page one text with a term.');
    expect(result.downstreamSource).toBe('proofread');
    expect(result.summary.conversionErrorsCorrected).toBe(1);
    expect(readFileSync(work.proofreadPath, 'utf8')).toContain('with a term');
    expect(existsSync(join(work.reviewDir, 'issues.json'))).toBe(true);
    expect(existsSync(join(work.reviewDir, 'patches.json'))).toBe(true);
    expect(existsSync(join(work.reviewDir, 'page-map.json'))).toBe(true);
    expect(existsSync(join(work.reviewDir, 'status.json'))).toBe(true);
    expect(existsSync(join(work.reviewDir, 'proofread-report.md'))).toBe(true);
    expect(reconstruct(RAW, result.patches)).toBe(result.proofreadMarkdown);
  });

  it('replays review and verification from cache for free', async () => {
    const work = tempWorkdir();
    await runProofread(commonOptions(work));
    const replay = fakeClient();
    const result = await runProofread({ ...commonOptions(work), reviewClient: replay });
    expect(result.status).toBe('PASS_WITH_WARNINGS');
    expect(replay.reviewCalls).toHaveLength(0);
    expect(replay.verifyCalls).toHaveLength(0);
  });

  it('report mode leaves downstream on raw Markdown while writing the corrected copy', async () => {
    const work = tempWorkdir();
    const result = await runProofread({ ...commonOptions(work), mode: 'report' });
    expect(result.downstreamSource).toBe('raw');
    expect(result.selectedMarkdown).toBe(RAW);
    expect(result.proofreadMarkdown).toContain('with a term');
    expect(result.summary.partialFallbackUsed).toBe(false);
  });

  it('inserts page markers at safe boundaries and reconstructs byte-for-byte', async () => {
    const work = tempWorkdir();
    const result = await runProofread({ ...commonOptions(work), pageMarkers: true });
    expect(result.proofreadMarkdown).toContain('<!-- pdf-page: 1 -->');
    expect(result.proofreadMarkdown).toContain('<!-- pdf-page: 2 -->');
    expect(result.proofreadMarkdown).toContain('<!-- pdf-page: 3 -->');
    expect(result.pageMap.markerSkipped).toEqual([]);
    expect(reconstruct(RAW, result.patches)).toBe(result.proofreadMarkdown);
  });

  it('keeps no-PDF runs PARTIAL and falls back to raw Markdown', async () => {
    const work = tempWorkdir();
    const result = await runProofread({
      documentId: 'book',
      markdown: RAW,
      workingDir: work.dir,
      reviewDir: work.reviewDir,
      proofreadMarkdownPath: work.proofreadPath,
      reviewClient: fakeClient(),
      verifierClient: new FakeProofreadClient(),
      budgetUsd: 1,
    });
    expect(result.status).toBe('PARTIAL');
    expect(result.pageMap.available).toBe(false);
    expect(result.pageMap.pages).toEqual([]);
    expect(result.downstreamSource).toBe('raw');
    expect(result.partialFallbackUsed).toBe(true);
    expect(result.proofreadMarkdown).toBe(RAW);
    expect(result.issues.every((entry) => entry.autoApplied !== true)).toBe(true);
  });

  it('aborts cleanly when the budget is exceeded before review', async () => {
    const work = tempWorkdir();
    const result = await runProofread({ ...commonOptions(work), budgetUsd: 0 });
    expect(result.status).toBe('PARTIAL');
    expect(result.issues.every((entry) => entry.autoApplied !== true)).toBe(true);
    expect(result.selectedMarkdown).toBe(RAW);
  });

  it('writes a dry-run plan without making calls', async () => {
    const work = tempWorkdir();
    const client = fakeClient();
    const result = await runProofread({
      ...commonOptions(work),
      reviewClient: client,
      verifierClient: client,
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(result.status).toBe('PARTIAL');
    expect(client.reviewCalls).toHaveLength(0);
    const dryRunPath = join(work.reviewDir, 'dry-run.json');
    expect(existsSync(dryRunPath)).toBe(true);
    const plan = JSON.parse(readFileSync(dryRunPath, 'utf8')) as {
      pagesTotal: number;
      estimatedTotalUsd: number;
    };
    expect(plan.pagesTotal).toBe(3);
    expect(plan.estimatedTotalUsd).toBeGreaterThan(0);
  });
});
