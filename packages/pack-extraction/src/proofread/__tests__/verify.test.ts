import { describe, expect, it } from 'vitest';
import type { PageMap, ProofreadIssue } from '../types.js';
import { ProofreadIssueSchema } from '../types.js';
import {
  autoApplyEligibility,
  groundEvidence,
  isHighRisk,
  isMaterialIssue,
  verifyCandidate,
} from '../verify.js';
import { FakeProofreadClient } from '../fake.js';
import { makePage, makeReference } from './fixtures.js';

const reference = makeReference([makePage(1, 'The fraction 1/2 is written as one half.')]);

const pageMap: PageMap = {
  available: true,
  pdfSha256: 'pdf',
  rawMarkdownSha256: 'raw',
  liteparseVersion: 'test',
  pages: [
    {
      pageNum: 1,
      startLine: 1,
      endLine: 2,
      confidence: 'high',
      method: 'exact-anchor',
      referenceKind: 'text',
    },
  ],
  unaligned: [],
  markerSkipped: [],
};

function issue(overrides: Partial<ProofreadIssue> = {}): ProofreadIssue {
  return ProofreadIssueSchema.parse({
    page: 1,
    issueClass: 'source-fidelity',
    category: 'punctuation',
    classification: 'CONVERSION_ERROR',
    finding: 'Wrong punctuation',
    evidenceKind: 'pdf-text',
    evidence: 'The fraction 1/2 is written as one half.',
    markdownExcerpt: 'The fraction 1/2 is written as one half',
    location: { lineStart: 1, lineEnd: 2 },
    proposedAction: 'replace',
    patch: {
      op: 'replace',
      exact: 'one half',
      replacement: 'one-half',
      before: '',
      after: '',
      origin: 'llm',
    },
    confidence: 'high',
    ...overrides,
  });
}

describe('evidence grounding', () => {
  it('requires a PDF-text quote to occur in the page reference', () => {
    expect(groundEvidence(issue(), 'one half', reference.pages).grounded).toBe(true);
    expect(
      groundEvidence(issue({ evidence: 'not in the page' }), 'one half', reference.pages).grounded,
    ).toBe(false);
  });

  it('grounds Markdown evidence against the document', () => {
    const markdownIssue = issue({
      issueClass: 'markdown-validity',
      evidenceKind: 'markdown',
      evidence: 'one half',
    });
    expect(groundEvidence(markdownIssue, 'the one half text', []).grounded).toBe(true);
    expect(groundEvidence(markdownIssue, 'something else', []).grounded).toBe(false);
  });
});

describe('auto-apply rules', () => {
  it('allows a high-confidence conversion error with a resolved anchor', () => {
    const result = autoApplyEligibility(issue(), {
      pageMap,
      partial: false,
      reviewer: { provider: 'a', model: 'a' },
      verifier: { provider: 'b', model: 'b' },
    });
    expect(result.eligible).toBe(true);
  });

  it('rejects low confidence, partial runs, non-conversion classes, and ambiguous pages', () => {
    const base = {
      pageMap,
      partial: false,
      reviewer: { provider: 'a', model: 'a' },
      verifier: { provider: 'b', model: 'b' },
    };
    expect(autoApplyEligibility(issue({ confidence: 'medium' }), base).eligible).toBe(false);
    expect(autoApplyEligibility(issue(), { ...base, partial: true }).eligible).toBe(false);
    expect(autoApplyEligibility(issue({ classification: 'STRUCTURAL_ISSUE' }), base).eligible).toBe(
      false,
    );
    expect(autoApplyEligibility(issue({ page: undefined }), base).eligible).toBe(false);
  });

  it('requires an independent verifier for high-risk categories', () => {
    const mathIssue = issue({ category: 'math-notation' });
    expect(isHighRisk(mathIssue)).toBe(true);
    expect(
      autoApplyEligibility(mathIssue, {
        pageMap,
        partial: false,
        reviewer: { provider: 'same', model: 'same' },
        verifier: { provider: 'same', model: 'same' },
      }).eligible,
    ).toBe(false);
    expect(
      autoApplyEligibility(mathIssue, {
        pageMap,
        partial: false,
        reviewer: { provider: 'same', model: 'same' },
        verifier: { provider: 'other', model: 'other' },
      }).eligible,
    ).toBe(true);
  });
});

describe('candidate verification', () => {
  it('accepts and rejects from the verifier response', async () => {
    const accepting = new FakeProofreadClient();
    const accepted = await verifyCandidate({
      issue: issue(),
      patch: issue().patch as never,
      pageReference: reference.pages[0],
      reviewer: accepting,
      verifier: accepting,
      prompt: 'verify',
    });
    expect(accepted?.response.decision).toBe('accept');

    const rejecting = new FakeProofreadClient({
      verify: () => ({ decision: 'reject', reason: 'not supported', evidence: '' }),
    });
    const rejected = await verifyCandidate({
      issue: issue(),
      patch: issue().patch as never,
      pageReference: reference.pages[0],
      reviewer: accepting,
      verifier: rejecting,
      prompt: 'verify',
    });
    expect(rejected?.response.decision).toBe('reject');
  });

  it('refuses high-risk verification when the verifier is not independent', async () => {
    const same = new FakeProofreadClient();
    const outcome = await verifyCandidate({
      issue: issue({ category: 'math-notation' }),
      patch: issue().patch as never,
      pageReference: reference.pages[0],
      reviewer: same,
      verifier: same,
      prompt: 'verify',
    });
    expect(outcome).toBeUndefined();
  });

  it('classifies material and non-material issues', () => {
    expect(isMaterialIssue(issue())).toBe(true);
    expect(
      isMaterialIssue(issue({ category: 'punctuation', classification: 'UNVERIFIABLE' })),
    ).toBe(false);
    expect(
      isMaterialIssue(
        issue({ issueClass: 'source-error', classification: 'POSSIBLE_SOURCE_ERROR' }),
      ),
    ).toBe(true);
  });
});
