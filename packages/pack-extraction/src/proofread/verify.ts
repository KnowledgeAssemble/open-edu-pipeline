import type {
  PageMap,
  PageReference,
  Patch,
  ProofreadClient,
  ProofreadIssue,
  VerificationResponse,
} from './types.js';
import { patchWithinLimits } from './patch.js';
import { normalizeWhitespace } from './util.js';
import { sameReviewerAndVerifier } from './client.js';

const HIGH_RISK_CATEGORIES = new Set([
  'math-notation',
  'table-structure',
  'numbers-dates-units',
  'reading-order',
  'missing-content',
]);

export function isHighRisk(issue: ProofreadIssue): boolean {
  return HIGH_RISK_CATEGORIES.has(issue.category);
}

export interface GroundingResult {
  grounded: boolean;
  reason: string;
}

/**
 * Deterministic evidence grounding. Visual evidence is grounded by the
 * independent verifier instead; Markdown evidence can never auto-apply.
 */
export function groundEvidence(
  issue: ProofreadIssue,
  markdown: string,
  pageReferences: PageReference[],
): GroundingResult {
  const evidence = normalizeWhitespace(issue.evidence).toLowerCase();
  if (issue.evidenceKind === 'markdown') {
    if (evidence === '') return { grounded: false, reason: 'markdown evidence is empty' };
    const haystack = normalizeWhitespace(markdown).toLowerCase();
    return haystack.includes(evidence)
      ? { grounded: true, reason: 'markdown evidence found' }
      : { grounded: false, reason: 'markdown evidence not found in the document' };
  }

  if (issue.evidenceKind === 'pdf-visual') {
    return { grounded: true, reason: 'visual evidence deferred to verifier' };
  }

  if (evidence === '') return { grounded: false, reason: 'PDF evidence is empty' };
  const candidates =
    issue.page === undefined
      ? pageReferences
      : pageReferences.filter(
          (page) =>
            page.pageNum === issue.page ||
            (issue.pageEnd !== undefined &&
              page.pageNum >= (issue.page ?? 0) &&
              page.pageNum <= issue.pageEnd),
        );
  if (candidates.length === 0) {
    return { grounded: false, reason: 'no page reference for PDF-text evidence' };
  }
  const found = candidates.some((page) => {
    const haystack = normalizeWhitespace(`${page.text}\n${page.pageMarkdown}`).toLowerCase();
    return haystack.includes(evidence);
  });
  return found
    ? { grounded: true, reason: 'PDF-text evidence found in the page reference' }
    : { grounded: false, reason: 'PDF-text evidence not found in the page reference' };
}

export interface AutoApplyContext {
  pageMap: PageMap;
  partial: boolean;
  reviewer?: Pick<ProofreadClient, 'provider' | 'model'>;
  verifier?: Pick<ProofreadClient, 'provider' | 'model'>;
}

/** Deterministic pre-verification rules from design §6. */
export function autoApplyEligibility(
  issue: ProofreadIssue,
  context: AutoApplyContext,
): { eligible: boolean; reason: string } {
  if (context.partial) return { eligible: false, reason: 'run is PARTIAL' };
  if (issue.classification !== 'CONVERSION_ERROR') {
    return { eligible: false, reason: `classification is ${issue.classification}` };
  }
  if (issue.issueClass !== 'source-fidelity') {
    return { eligible: false, reason: `issueClass is ${issue.issueClass}` };
  }
  if (issue.evidenceKind !== 'pdf-text' && issue.evidenceKind !== 'pdf-visual') {
    return { eligible: false, reason: `evidenceKind is ${issue.evidenceKind}` };
  }
  if (issue.confidence !== 'high') {
    return { eligible: false, reason: `confidence is ${issue.confidence}` };
  }
  if (issue.page === undefined) return { eligible: false, reason: 'issue has no resolved page' };
  const page = context.pageMap.pages.find((candidate) => candidate.pageNum === issue.page);
  if (!page) return { eligible: false, reason: 'issue page is not in the page map' };
  if (page.confidence !== 'high' && page.confidence !== 'medium') {
    return { eligible: false, reason: `page alignment confidence is ${page.confidence}` };
  }
  if (issue.patch === undefined) return { eligible: false, reason: 'issue has no patch' };
  if (!['replace', 'insert-before', 'insert-after', 'delete'].includes(issue.proposedAction)) {
    return {
      eligible: false,
      reason: `proposedAction ${issue.proposedAction} is never auto-applied`,
    };
  }
  if (issue.patch.op !== issue.proposedAction) {
    return { eligible: false, reason: 'patch operation does not match proposedAction' };
  }
  const size = patchWithinLimits(issue.patch);
  if (!size.ok) return { eligible: false, reason: size.reason };
  if (isHighRisk(issue)) {
    if (context.verifier === undefined) {
      return { eligible: false, reason: 'independent verifier is unavailable' };
    }
    if (
      context.reviewer !== undefined &&
      sameReviewerAndVerifier(context.reviewer, context.verifier)
    ) {
      return { eligible: false, reason: 'high-risk patch lacks an independent verifier' };
    }
  }
  return { eligible: true, reason: 'eligible' };
}

export interface VerificationOutcome {
  response: VerificationResponse;
  reason: string;
}

export function correctedSnippet(patch: Patch): { original: string; corrected: string } {
  switch (patch.op) {
    case 'replace':
      return { original: patch.exact, corrected: patch.replacement };
    case 'insert-before':
      return { original: patch.exact, corrected: `${patch.text}\n${patch.exact}` };
    case 'insert-after':
      return { original: patch.exact, corrected: `${patch.exact}\n${patch.text}` };
    case 'delete':
      return { original: patch.exact, corrected: '' };
  }
}

/**
 * Every candidate LLM patch is verified. High-risk categories require a
 * different model/provider; if that is unavailable the patch is not applied.
 */
export async function verifyCandidate(args: {
  issue: ProofreadIssue;
  patch: Patch;
  pageReference?: PageReference;
  reviewer: Pick<ProofreadClient, 'provider' | 'model'>;
  verifier?: ProofreadClient;
  prompt: string;
}): Promise<VerificationOutcome | undefined> {
  if (args.verifier === undefined) return undefined;
  if (isHighRisk(args.issue) && sameReviewerAndVerifier(args.reviewer, args.verifier)) {
    return undefined;
  }
  const snippets = correctedSnippet(args.patch);
  const response = await args.verifier.verify({
    patch: args.patch,
    issue: args.issue,
    original: snippets.original,
    corrected: snippets.corrected,
    pageReference: args.pageReference,
    prompt: args.prompt,
  });
  return {
    response,
    reason:
      response.decision === 'accept'
        ? response.reason || 'verifier accepted'
        : response.reason || 'verifier rejected',
  };
}

/** A material issue is anything that can affect content fidelity/correctness. */
export function isMaterialIssue(issue: ProofreadIssue): boolean {
  if (issue.classification === 'POSSIBLE_SOURCE_ERROR') return true;
  if (issue.classification === 'CONVERSION_ERROR') return true;
  if (issue.classification === 'STRUCTURAL_ISSUE') {
    return [
      'missing-content',
      'duplicated-content',
      'reading-order',
      'heading-hierarchy',
      'table-structure',
      'list-structure',
      'math-notation',
      'numbers-dates-units',
      'component-order',
      'association-error',
      'missing-image-caption',
      'markdown-syntax',
    ].includes(issue.category);
  }
  return false;
}
