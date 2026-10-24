import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CacheStore } from '../cache/store.js';
import { BudgetGuard, estimateCall } from '../stages/budget.js';
import type { CallEstimate } from '../stages/budget.js';
import { alignPages, pageAtLine, pilotGate, unavailablePageMap } from './align.js';
import { pageArtifactFindings, pageCoverageFindings, runDeterministicChecks } from './checks.js';
import { assignWindowIssues, sortIssues } from './detect.js';
import { applyPatches, existingMarkerDeletePatches, pageMarkerPatches } from './patch.js';
import {
  buildReference,
  unavailableReference,
  isContentPage,
  shouldRouteToVision,
} from './reference.js';
import type {
  BuildReferenceOptions,
  ReferenceBuildDependencies,
  ReferenceParseOptions,
  ReferenceRawProvenance,
} from './reference.js';
import { buildReviewPrompt, buildVerificationPrompt } from './prompt.js';
import { sameReviewerAndVerifier } from './client.js';
import { writeProofreadArtifacts } from './report.js';
import type { PageArtifact, ReportData } from './report.js';
import type {
  PageMap,
  PageReference,
  Patch,
  PatchRecord,
  ProofreadClient,
  ProofreadIssue,
  ProofreadResult,
  ProofreadStatus,
  PageReview,
  PageWindow,
  ProofreadSummary,
  ReferenceBundle,
  ReferenceMode,
  VerificationResponse,
} from './types.js';
import {
  DEFAULT_WINDOW_PAGES,
  PROOFREAD_PROMPT_VERSION,
  PROOFREAD_SCHEMA_VERSION,
  PROOFREAD_VERIFIER_PROMPT_VERSION,
} from './types.js';
import { buildWindows, windowCacheId, windowReferenceHash } from './window.js';
import {
  autoApplyEligibility,
  groundEvidence,
  isMaterialIssue,
  verifyCandidate,
} from './verify.js';
import { normalizeWhitespace, sha256, stableJson } from './util.js';

export interface RunProofreadOptions {
  documentId: string;
  markdown: string;
  pdfPath?: string;
  title?: string;
  language?: string;
  /** Artifact/cache root, e.g. output/<id> (embedded) or the standalone output dir. */
  workingDir: string;
  /** Directory for issues/patches/page-map/status/report/pages. */
  reviewDir: string;
  /** Where the corrected Markdown copy is written. */
  proofreadMarkdownPath: string;
  /** Standalone also writes <doc-id>.proofread-report.md at the output root. */
  reportCopyPath?: string;
  mode?: 'report' | 'apply';
  referenceMode?: ReferenceMode;
  pageMarkers?: boolean;
  windowSize?: number;
  verify?: 'changed' | 'full';
  force?: boolean;
  dryRun?: boolean;
  budgetUsd?: number;
  pages?: number[];
  strict?: boolean;
  reviewClient?: ProofreadClient;
  verifierClient?: ProofreadClient;
  /** Test seam: pre-built reference bundle. */
  reference?: ReferenceBundle;
  referenceDependencies?: ReferenceBuildDependencies;
  parseOptions?: ReferenceParseOptions;
  screenshotDpi?: number;
  rawProvenance?: ReferenceRawProvenance;
  assetPaths?: Set<string>;
  /** Degrade a reference-build failure to text-only PARTIAL instead of throwing. */
  allowReferenceFailure?: boolean;
  now?: () => Date;
  log?: (message: string) => void;
}

interface ReviewCacheKeyInput {
  pages: number[];
  /** Full prompt, including deterministic findings, so hint changes invalidate. */
  prompt: string;
  referenceHash: string;
  kind: string;
  promptVersion: string;
  schemaVersion: string;
  provider: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

function hashKey(value: unknown): string {
  return sha256(stableJson(value));
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter((token) => token !== ''),
  );
}

function textSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

/**
 * Deep per-page diff accepted as equivalence when every aligned content page's
 * normalized reference text matches its raw Markdown slice.
 */
function referenceEquivalent(
  rawMarkdown: string,
  reference: ReferenceBundle,
  pageMap: PageMap,
): { accepted: boolean; ratio: number } {
  const rawLines = rawMarkdown.split(/\r?\n/);
  let contentPages = 0;
  let matchingPages = 0;
  for (const entry of pageMap.pages) {
    if (entry.confidence === 'low') continue;
    const page = reference.pages.find((candidate) => candidate.pageNum === entry.pageNum);
    if (page === undefined || !isContentPage(page)) continue;
    contentPages += 1;
    const referenceText = normalizeWhitespace(page.pageMarkdown || page.text);
    const rawSlice = normalizeWhitespace(
      rawLines.slice(entry.startLine - 1, entry.endLine).join('\n'),
    );
    if (referenceText === rawSlice || textSimilarity(referenceText, rawSlice) >= 0.9) {
      matchingPages += 1;
    }
  }
  const ratio = contentPages === 0 ? 1 : matchingPages / contentPages;
  return { accepted: contentPages > 0 && ratio === 1, ratio };
}

function windowCacheReferenceHash(window: PageWindow): string {
  const parts = [windowReferenceHash(window)];
  for (const page of window.pages) {
    if (page.screenshotPath === undefined || !existsSync(page.screenshotPath)) continue;
    parts.push(sha256(readFileSync(page.screenshotPath)));
  }
  return sha256(parts.join('\u0001'));
}

function budgetEstimate(model: string, prompt: string): CallEstimate {
  return estimateCall(model, prompt, 3_000);
}

function estimateImageTokens(windows: PageReference[]): number {
  return windows.filter((page) => page.screenshotPath !== undefined).length * 1_000;
}

function pagePresenceIssues(
  presence: Array<{ pageNum: number; status: string; note?: string }>,
): ProofreadIssue[] {
  const issues: ProofreadIssue[] = [];
  for (const page of presence) {
    if (page.status === 'present') continue;
    const category = page.status === 'duplicated' ? 'duplicated-content' : 'missing-content';
    issues.push({
      page: page.pageNum,
      issueClass: 'source-fidelity',
      category,
      classification: 'STRUCTURAL_ISSUE',
      finding:
        page.status === 'duplicated'
          ? `Page ${page.pageNum} content appears duplicated`
          : `Page ${page.pageNum} content is ${page.status}`,
      evidenceKind: 'pdf-text',
      evidence: page.note ?? '',
      markdownExcerpt: '',
      location: { lineStart: 0, lineEnd: 0 },
      proposedAction: 'flag',
      confidence: 'medium',
    });
  }
  return issues;
}

function statusFor(input: {
  partialReasons: string[];
  issues: ProofreadIssue[];
  referenceMismatch: boolean;
  referenceMismatchAccepted: boolean;
  forcedTextVisualPages: number;
  verifierUnavailable: boolean;
  dryRun: boolean;
}): { status: ProofreadStatus; reasons: string[] } {
  const reasons = [...input.partialReasons];
  const sourceErrors = input.issues.filter(
    (issue) => issue.classification === 'POSSIBLE_SOURCE_ERROR' && issue.autoApplied !== true,
  );
  // Deterministic checks are hints, not conclusions: only LLM-confirmed material
  // issues gate NEEDS_REVIEW. Source errors remain material by design.
  const unresolvedMaterial = input.issues.filter(
    (issue) =>
      issue.autoApplied !== true &&
      isMaterialIssue(issue) &&
      issue.classification !== 'POSSIBLE_SOURCE_ERROR' &&
      issue.deterministic !== true,
  );
  const advisories = input.issues.filter(
    (issue) =>
      issue.autoApplied !== true && (issue.deterministic === true || !isMaterialIssue(issue)),
  );
  const corrected = input.issues.filter((issue) => issue.autoApplied === true);

  if (input.partialReasons.length > 0) {
    return { status: 'PARTIAL', reasons };
  }
  if (input.dryRun) {
    return { status: 'PARTIAL', reasons: [...reasons, 'dry run: no pages were inspected'] };
  }

  const needsReview: string[] = [];
  if (input.referenceMismatch) {
    needsReview.push('reference provenance does not match the raw Markdown');
  }
  if (input.forcedTextVisualPages > 0) {
    needsReview.push(
      `${input.forcedTextVisualPages} visual page(s) were forced to text-only inspection`,
    );
  }
  if (input.verifierUnavailable) {
    needsReview.push(
      'a required independent verifier was unavailable; high-risk patches were report-only',
    );
  }
  if (unresolvedMaterial.length > 0) {
    needsReview.push(`${unresolvedMaterial.length} unresolved material issue(s)`);
  }
  if (sourceErrors.length > 0) {
    needsReview.push(`${sourceErrors.length} possible source error(s) flagged (not changed)`);
  }

  if (needsReview.length > 0) {
    return { status: 'NEEDS_REVIEW', reasons: [...reasons, ...needsReview] };
  }

  const warnings: string[] = [];
  if (input.referenceMismatchAccepted) {
    warnings.push('reference provenance mismatch accepted by deep per-page diff');
  }
  if (corrected.length > 0) warnings.push(`${corrected.length} confirmed correction(s)`);
  if (advisories.length > 0) warnings.push(`${advisories.length} advisory finding(s)`);

  if (warnings.length > 0) {
    return { status: 'PASS_WITH_WARNINGS', reasons: [...reasons, ...warnings] };
  }
  return { status: 'PASS', reasons };
}

function issueKey(issue: ProofreadIssue): string {
  return [issue.page ?? 'none', issue.category, issue.finding].join('\u0000');
}

export async function runProofread(options: RunProofreadOptions): Promise<ProofreadResult> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => {});
  const mode = options.mode ?? 'apply';
  const referenceMode = options.referenceMode ?? 'auto';
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_PAGES;
  const budget = new BudgetGuard(options.budgetUsd ?? 1);
  const reviewClient = options.reviewClient;
  const verifierClient = options.verifierClient;
  const reviewer = reviewClient ?? { provider: 'none', model: 'none' };
  const verifier = verifierClient ?? { provider: 'none', model: 'none' };
  if (
    reviewClient !== undefined &&
    verifierClient !== undefined &&
    sameReviewerAndVerifier(reviewer, verifier)
  ) {
    log(
      'warning: proofread verifier is the same model/provider as the reviewer; high-risk patches will be report-only',
    );
  }
  const cache = new CacheStore(join(options.workingDir, 'cache', 'proofread'));
  const partialReasons: string[] = [];
  const verificationFailures: string[] = [];
  const inspected = new Set<number>();
  const reInspected = new Set<number>();
  const issues: ProofreadIssue[] = [];
  const knownIssueKeys = new Set<string>();
  let aborted = false;
  let verifierUnavailable = false;

  const addIssue = (issue: ProofreadIssue): void => {
    const key = issueKey(issue);
    if (knownIssueKeys.has(key)) return;
    knownIssueKeys.add(key);
    issues.push(issue);
  };
  const addIssues = (items: ProofreadIssue[]): void => {
    for (const item of items) addIssue(item);
  };

  let reference: ReferenceBundle;
  let missingPdf = false;
  if (options.reference !== undefined) {
    reference = options.reference;
  } else if (options.pdfPath === undefined) {
    reference = unavailableReference(options.markdown);
  } else if (!existsSync(options.pdfPath)) {
    missingPdf = true;
    reference = unavailableReference(options.markdown);
  } else {
    const referenceOptions: BuildReferenceOptions = {
      pdfPath: options.pdfPath,
      cacheDir: join(options.workingDir, 'cache', 'proofread'),
      rawMarkdown: options.markdown,
      screenshotDpi: options.screenshotDpi,
      referenceMode,
      force: options.force,
      cacheOnly: options.dryRun === true,
      now,
      ...(options.parseOptions === undefined ? {} : { parseOptions: options.parseOptions }),
      ...(options.rawProvenance === undefined ? {} : { rawProvenance: options.rawProvenance }),
      ...(options.referenceDependencies === undefined
        ? {}
        : { dependencies: options.referenceDependencies }),
    };
    try {
      reference = await buildReference(referenceOptions);
    } catch (error) {
      if (options.allowReferenceFailure !== true) throw error;
      missingPdf = true;
      reference = unavailableReference(options.markdown);
      log(
        `reference build failed; falling back to text-only review: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  let pageMap: PageMap;
  if (reference.available) {
    pageMap = alignPages({ rawMarkdown: options.markdown, reference }).pageMap;
  } else {
    pageMap = unavailablePageMap(options.markdown);
  }

  const referenceMismatch = reference.available && reference.manifest.referenceMismatch;
  const equivalence = referenceMismatch
    ? referenceEquivalent(options.markdown, reference, pageMap)
    : { accepted: false, ratio: 1 };
  if (equivalence.accepted) {
    log(
      `reference provenance mismatch accepted by deep per-page diff (${(equivalence.ratio * 100).toFixed(1)}% pages match)`,
    );
  }

  if (!reference.available) {
    partialReasons.push(
      missingPdf
        ? `PDF reference not found: ${options.pdfPath ?? ''}; source fidelity cannot be verified`
        : 'PDF reference unavailable; source fidelity cannot be verified',
    );
  }
  const unalignedContent = reference.pages.filter(
    (page) =>
      isContentPage(page) &&
      pageMap.unaligned.includes(page.pageNum) &&
      !pageMap.pages.some((entry) => entry.pageNum === page.pageNum),
  );
  if (unalignedContent.length > 0) {
    partialReasons.push(
      `content pages could not be aligned: ${unalignedContent.map((page) => page.pageNum).join(', ')}`,
    );
  }
  if (reference.available && reference.pages.length > 0) {
    const gate = pilotGate(pageMap);
    if (!gate.ok) {
      partialReasons.push(
        `page alignment coverage is below the pilot gate (${(gate.highOrMediumRatio * 100).toFixed(1)}% high/medium, ${(gate.highRatio * 100).toFixed(1)}% high)`,
      );
    }
  }

  const forcedTextVisualPages = reference.pages.filter(
    (page) =>
      page.kind === 'text' &&
      shouldRouteToVision({
        text: page.text,
        markdown: page.pageMarkdown,
        ...(page.complexity === undefined ? {} : { complexity: page.complexity as never }),
      }),
  ).length;

  const missingVisionReferences = reference.pages.filter(
    (page) => page.kind === 'vision' && !page.hasScreenshot && !options.dryRun,
  );
  if (missingVisionReferences.length > 0) {
    partialReasons.push(
      `vision reference could not be obtained for pages ${missingVisionReferences
        .map((page) => page.pageNum)
        .join(', ')}`,
    );
  }
  for (const page of reference.pages) {
    if (page.kind !== 'text') continue;
    if (
      !shouldRouteToVision({
        text: page.text,
        markdown: page.pageMarkdown,
        ...(page.complexity === undefined ? {} : { complexity: page.complexity as never }),
      })
    ) {
      continue;
    }
    addIssue({
      page: page.pageNum,
      issueClass: 'source-fidelity',
      category: 'page-artifacts',
      classification: 'UNVERIFIABLE',
      finding:
        'Visual page was inspected with the text reference only; source fidelity is unverified',
      evidenceKind: 'markdown',
      evidence: page.text.slice(0, 300),
      markdownExcerpt: '',
      location: { lineStart: 0, lineEnd: 0 },
      proposedAction: 'flag',
      confidence: 'low',
      deterministic: true,
    });
  }

  if (options.pages !== undefined && options.pages.length > 0) {
    partialReasons.push(
      'subset re-run (--proofread-pages) has no complete prior run to merge; using raw Markdown downstream',
    );
  }

  const deterministic = runDeterministicChecks(options.markdown, {
    ...(options.assetPaths === undefined ? {} : { assetPaths: options.assetPaths }),
  });
  addIssues(deterministic);
  if (reference.available) {
    addIssues(pageCoverageFindings(options.markdown, reference.pages, pageMap));
    addIssues(pageArtifactFindings(reference.pages, pageMap));
  }

  const windows = buildWindows({
    rawMarkdown: options.markdown,
    referencePages: reference.pages,
    pageMap,
    windowSize,
    deterministicFindings: deterministic,
  });
  if (windows.oversizedPages.length > 0) {
    partialReasons.push(
      `page block exceeds the review size limit and needs manual inspection: ${windows.oversizedPages.join(', ')}`,
    );
  }
  const filteredWindows =
    options.pages === undefined || options.pages.length === 0
      ? windows.windows
      : windows.windows.filter((window) =>
          window.pageNums.some((page) => options.pages?.includes(page)),
        );

  const dryRunPlan = {
    documentId: options.documentId,
    pagesTotal: reference.pages.length,
    pagesRoutedText: reference.pages.filter((page) => page.kind === 'text').length,
    pagesRoutedVision: reference.pages.filter((page) => page.kind === 'vision').length,
    pagesUnaligned: pageMap.unaligned.length,
    alignment: pageMap.pages.map((page) => ({
      pageNum: page.pageNum,
      confidence: page.confidence,
      method: page.method,
    })),
    windows: filteredWindows.map((window) => ({
      pages: window.pageNums,
      kind: window.kind,
      startLine: window.startLine,
      endLine: window.endLine,
      imageCount: window.pages.filter((page) => page.screenshotPath !== undefined).length,
    })),
    estimatedReviewUsd: 0,
    estimatedVerificationUsd: 0,
    estimatedTotalUsd: 0,
    cacheHits: 0,
    note: 'No review or verification calls were made.',
  };

  if (options.dryRun) {
    let reviewCost = 0;
    let verifyCost = 0;
    let cacheHits = 0;
    for (const window of filteredWindows) {
      const prompt = buildReviewPrompt({
        title: options.title ?? options.documentId,
        ...(options.language === undefined ? {} : { language: options.language }),
        pageCount: reference.pages.length,
        window,
        findings: deterministic,
      });
      const key = hashKey({
        pages: window.pageNums,
        prompt,
        referenceHash: windowCacheReferenceHash(window),
        kind: window.kind,
        promptVersion: PROOFREAD_PROMPT_VERSION,
        schemaVersion: PROOFREAD_SCHEMA_VERSION,
        provider: reviewer.provider,
        model: reviewer.model,
        maxTokens: 8192,
        temperature: 0,
      } satisfies ReviewCacheKeyInput);
      if (!options.force && cache.get('review', windowCacheId(window), key)) cacheHits += 1;
      const imageTokens = estimateImageTokens(window.pages);
      reviewCost += estimateCall(
        reviewer.model,
        `${prompt}${'x'.repeat(imageTokens * 4)}`,
        3_000,
      ).costUsd;
      const verifyPrompt = buildVerificationPrompt({
        issue: deterministic[0] ?? {
          issueClass: 'source-fidelity',
          category: 'punctuation',
          classification: 'CONVERSION_ERROR',
          finding: 'estimate',
          evidenceKind: 'pdf-text',
          evidence: '',
          markdownExcerpt: '',
          location: { lineStart: 0, lineEnd: 0 },
          proposedAction: 'flag',
          confidence: 'high',
        },
        patch: {
          op: 'replace',
          exact: 'x',
          replacement: 'x',
          before: '',
          after: '',
          origin: 'llm',
        },
        original: 'x',
        corrected: 'x',
      });
      verifyCost += estimateCall(verifier.model, verifyPrompt, 1_200).costUsd;
    }
    dryRunPlan.estimatedReviewUsd = reviewCost;
    dryRunPlan.estimatedVerificationUsd = verifyCost;
    dryRunPlan.estimatedTotalUsd = reviewCost + verifyCost;
    dryRunPlan.cacheHits = cacheHits;

    partialReasons.push('dry run: no pages were inspected');
    const summary = summaryFor({
      reference,
      pageMap,
      issues,
      inspected,
      budget,
      mode,
      status: 'PARTIAL',
      now,
    });
    summary.referenceMismatchAccepted = equivalence.accepted;
    const metadata = metadataFor({
      options,
      reference,
      markdown: options.markdown,
      proofreadMarkdown: options.markdown,
      pageMap,
      patches: [],
      reviewer,
      verifier,
      now,
    });
    const data: ReportData = {
      documentId: options.documentId,
      rawMarkdown: options.markdown,
      proofreadMarkdown: options.markdown,
      issues: [],
      patches: [],
      pageMap,
      summary,
      status: 'PARTIAL',
      statusReasons: partialReasons,
      metadata,
      inspectedPages: [],
      reInspectedPages: [],
      pages: pageArtifacts(reference.pages, pageMap, issues, inspected, reInspected),
      verificationFailures,
      dryRun: true,
    };
    const artifacts = writeProofreadArtifacts({
      data,
      reviewDir: options.reviewDir,
      proofreadMarkdownPath: options.proofreadMarkdownPath,
      ...(options.reportCopyPath === undefined ? {} : { reportCopyPath: options.reportCopyPath }),
      dryRun: dryRunPlan,
    });
    return {
      status: 'PARTIAL',
      statusReasons: partialReasons,
      rawMarkdown: options.markdown,
      proofreadMarkdown: options.markdown,
      selectedMarkdown: options.markdown,
      downstreamSource: 'raw',
      partialFallbackUsed: true,
      issues: [],
      patches: [],
      pageMap,
      summary,
      metadata,
      artifacts,
      spentUsd: 0,
      inspectedPages: [],
      reInspectedPages: [],
      dryRun: true,
    };
  }

  if (reviewClient === undefined) {
    partialReasons.push('no proofreading client is configured (missing API key?)');
  }

  if (reviewClient !== undefined) {
    for (const window of filteredWindows) {
      const prompt = buildReviewPrompt({
        title: options.title ?? options.documentId,
        ...(options.language === undefined ? {} : { language: options.language }),
        pageCount: reference.pages.length,
        window,
        findings: deterministic,
      });
      const imageTokens = estimateImageTokens(window.pages);
      const projected = estimateCall(
        reviewer.model,
        `${prompt}${'x'.repeat(imageTokens * 4)}`,
        3_000,
      );
      if (budget.wouldExceed(projected)) {
        aborted = true;
        partialReasons.push(`budget exceeded before reviewing pages ${window.pageNums.join(', ')}`);
        break;
      }

      const missingImage =
        window.kind === 'vision' && window.pages.some((page) => page.screenshotPath === undefined);
      if (missingImage) {
        verificationFailures.push(`no screenshot for vision page(s) ${window.pageNums.join(', ')}`);
        continue;
      }

      const key = hashKey({
        pages: window.pageNums,
        prompt,
        referenceHash: windowCacheReferenceHash(window),
        kind: window.kind,
        promptVersion: PROOFREAD_PROMPT_VERSION,
        schemaVersion: PROOFREAD_SCHEMA_VERSION,
        provider: reviewer.provider,
        model: reviewer.model,
        maxTokens: 8192,
        temperature: 0,
      } satisfies ReviewCacheKeyInput);
      const cacheId = windowCacheId(window);
      let review;
      try {
        const hit = options.force ? undefined : cache.get<PageReview>('review', cacheId, key);
        if (hit) {
          review = hit.value;
        } else {
          review = await reviewClient.review({ prompt, window });
          cache.set('review', cacheId, key, review, {
            key,
            model: reviewer.model,
            estimatedUsage: {
              inputTokens: projected.inputTokens,
              outputTokens: projected.outputTokens,
              costUsd: projected.costUsd,
            },
            createdAt: now().toISOString(),
          });
          budget.charge(projected);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        verificationFailures.push(
          `review failed for pages ${window.pageNums.join(', ')}: ${message}`,
        );
        partialReasons.push(
          `page review failed for ${window.pageNums.join(', ')}; page(s) unverified`,
        );
        continue;
      }

      for (const page of window.pageNums) inspected.add(page);
      addIssues(assignWindowIssues(review.issues, window, pageMap));
      addIssues(pagePresenceIssues(review.pagePresence));
      log(`reviewed pages ${window.pageNums.join(', ')} (${window.kind})`);
    }
  }

  const partial = partialReasons.length > 0;
  const acceptedCandidates: Array<{ issue: ProofreadIssue; patch: Patch }> = [];

  for (const issue of issues) {
    if (issue.autoApplied === true) continue;
    if (issue.patch === undefined) continue;
    if (issue.classification !== 'CONVERSION_ERROR') {
      issue.patch = undefined;
      continue;
    }
    const eligibility = autoApplyEligibility(issue, {
      pageMap,
      partial,
      reviewer,
      ...(verifierClient === undefined ? {} : { verifier: verifierClient }),
    });
    if (!eligibility.eligible) {
      issue.autoApplied = false;
      issue.verification = 'not-run';
      if (/verifier/i.test(eligibility.reason)) verifierUnavailable = true;
      continue;
    }
    const grounding = groundEvidence(issue, options.markdown, reference.pages);
    if (!grounding.grounded) {
      issue.classification = 'UNVERIFIABLE';
      issue.autoApplied = false;
      issue.verification = 'not-run';
      issue.patch = undefined;
      continue;
    }
    if (partial) {
      issue.autoApplied = false;
      issue.verification = 'not-run';
      continue;
    }
    if (issue.page === undefined) {
      issue.autoApplied = false;
      issue.verification = 'not-run';
      continue;
    }
    if (reviewClient === undefined || verifierClient === undefined) {
      issue.autoApplied = false;
      issue.verification = 'not-run';
      verifierUnavailable = true;
      continue;
    }
    const pageReference = reference.pages.find((page) => page.pageNum === issue.page);
    const prompt = buildVerificationPrompt({
      issue,
      patch: issue.patch,
      original: issue.patch.exact,
      corrected: issue.patch.op === 'replace' ? issue.patch.replacement : issue.patch.exact,
      ...(pageReference === undefined ? {} : { pageReference }),
    });
    const verifyKey = hashKey({
      patch: issue.patch,
      pageReference: [
        pageReference?.text ?? '',
        pageReference?.screenshotPath !== undefined && existsSync(pageReference.screenshotPath)
          ? sha256(readFileSync(pageReference.screenshotPath))
          : '',
      ].join('\u0000'),
      verifierPromptVersion: PROOFREAD_VERIFIER_PROMPT_VERSION,
      schemaVersion: PROOFREAD_SCHEMA_VERSION,
      provider: verifier.provider,
      model: verifier.model,
      evidence: issue.evidence,
    });
    const verifyId = `verify-${sha256(verifyKey).slice(0, 24)}`;
    const projected = estimateCall(verifier.model, prompt, 1_200);
    if (budget.wouldExceed(projected)) {
      aborted = true;
      partialReasons.push(`budget exceeded while verifying page ${issue.page}`);
      break;
    }
    let outcome;
    try {
      const hit = options.force
        ? undefined
        : cache.get<VerificationResponse>('verify', verifyId, verifyKey);
      if (hit) {
        outcome = { response: hit.value, reason: hit.value.reason || 'cached verification' };
      } else {
        outcome = await verifyCandidate({
          issue,
          patch: issue.patch,
          ...(pageReference === undefined ? {} : { pageReference }),
          reviewer,
          verifier: verifierClient,
          prompt,
        });
        if (outcome === undefined) {
          verifierUnavailable = true;
          issue.autoApplied = false;
          issue.verification = 'not-run';
          continue;
        }
        cache.set('verify', verifyId, verifyKey, outcome.response, {
          key: verifyKey,
          model: verifier.model,
          estimatedUsage: {
            inputTokens: projected.inputTokens,
            outputTokens: projected.outputTokens,
            costUsd: projected.costUsd,
          },
          createdAt: now().toISOString(),
        });
        budget.charge(projected);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      verificationFailures.push(`verification failed for page ${issue.page}: ${message}`);
      partialReasons.push(`verification could not run for a content page (page ${issue.page})`);
      issue.autoApplied = false;
      issue.verification = 'not-run';
      break;
    }

    if (outcome.response.decision === 'accept') {
      issue.verification = 'accepted';
      acceptedCandidates.push({ issue, patch: issue.patch });
    } else {
      issue.verification = 'rejected';
      issue.autoApplied = false;
      verificationFailures.push(`verifier rejected page ${issue.page}: ${outcome.reason}`);
    }
  }

  if (aborted && partialReasons.length === 0) {
    partialReasons.push('budget exceeded; run stopped with partial state');
  }

  const applyPartial = partialReasons.length > 0 || aborted;
  const pageMarkerResult =
    reference.available && options.pageMarkers === true && mode === 'apply' && !applyPartial
      ? pageMarkerPatches(options.markdown, pageMap)
      : { patches: [] as Patch[], skipped: [] as number[] };

  const patchesToApply: Patch[] = [];
  if (!applyPartial) {
    if (reference.available) patchesToApply.push(...existingMarkerDeletePatches(options.markdown));
    patchesToApply.push(...pageMarkerResult.patches);
    for (const candidate of acceptedCandidates) patchesToApply.push(candidate.patch);
  }

  const applied = applyPatches(options.markdown, patchesToApply);
  const proofreadMarkdown = applied.markdown;

  for (const candidate of acceptedCandidates) {
    const record = applied.records.find(
      (entry) => entry.patch === candidate.patch && entry.status === 'applied',
    );
    if (record) {
      candidate.issue.autoApplied = true;
      candidate.issue.verification = 'accepted';
    } else {
      const rejected = applied.records.find((entry) => entry.patch === candidate.patch);
      candidate.issue.autoApplied = false;
      verificationFailures.push(
        `patch rejected for page ${candidate.issue.page ?? '?'}: ${rejected?.reason ?? 'unknown'}`,
      );
    }
  }

  const markerSkipped = new Set(pageMarkerResult.skipped);
  for (const record of applied.records) {
    if (record.patch.origin !== 'page-map' || record.status !== 'rejected') continue;
    const pages = pageAtLine(pageMap, record.lineStart ?? 0);
    if (pages.length > 0) {
      for (const page of pages) markerSkipped.add(page.pageNum);
      continue;
    }
    const marker =
      record.patch.op === 'insert-before' || record.patch.op === 'insert-after'
        ? /pdf-page:\s*(\d+)/.exec(record.patch.text)
        : null;
    if (marker?.[1] !== undefined) markerSkipped.add(Number.parseInt(marker[1], 10));
  }
  pageMap.markerSkipped = [...markerSkipped].sort((a, b) => a - b);

  const changedPages = new Set<number>();
  for (const record of applied.applied) {
    if (record.patch.origin !== 'llm') continue;
    for (const page of pageAtLine(pageMap, record.lineStart ?? 0)) changedPages.add(page.pageNum);
  }

  if (
    !partial &&
    reviewClient !== undefined &&
    reference.available &&
    (changedPages.size > 0 || options.verify === 'full')
  ) {
    const targetPages =
      options.verify === 'full' ? reference.pages.map((page) => page.pageNum) : [...changedPages];
    const realigned = alignPages({ rawMarkdown: proofreadMarkdown, reference });
    const reviewWindows = buildWindows({
      rawMarkdown: proofreadMarkdown,
      referencePages: reference.pages,
      pageMap: realigned.pageMap,
      windowSize,
    }).windows.filter((window) => window.pageNums.some((page) => targetPages.includes(page)));
    for (const window of reviewWindows) {
      if (budget.wouldExceed(estimateCall(reviewer.model, window.markdown, 3_000))) {
        aborted = true;
        partialReasons.push('budget exceeded during changed-page re-review');
        break;
      }
      const reReviewFindings = runDeterministicChecks(proofreadMarkdown, {
        ...(options.assetPaths === undefined ? {} : { assetPaths: options.assetPaths }),
      });
      const prompt = buildReviewPrompt({
        title: options.title ?? options.documentId,
        ...(options.language === undefined ? {} : { language: options.language }),
        pageCount: reference.pages.length,
        window,
        findings: reReviewFindings,
      });
      const key = hashKey({
        pages: window.pageNums,
        prompt,
        referenceHash: windowCacheReferenceHash(window),
        kind: window.kind,
        promptVersion: PROOFREAD_PROMPT_VERSION,
        schemaVersion: PROOFREAD_SCHEMA_VERSION,
        provider: reviewer.provider,
        model: reviewer.model,
        maxTokens: 8192,
        temperature: 0,
      } satisfies ReviewCacheKeyInput);
      const cacheId = `re-review-${windowCacheId(window)}`;
      try {
        const hit = options.force ? undefined : cache.get<PageReview>('review', cacheId, key);
        const review = hit ? hit.value : await reviewClient.review({ prompt, window });
        if (!hit) {
          const usage = budgetEstimate(reviewer.model, prompt);
          cache.set('review', cacheId, key, review, {
            key,
            model: reviewer.model,
            estimatedUsage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              costUsd: usage.costUsd,
            },
            createdAt: now().toISOString(),
          });
          budget.charge(usage);
        }
        for (const page of window.pageNums) reInspected.add(page);
        addIssues(assignWindowIssues(review.issues, window, realigned.pageMap));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        verificationFailures.push(
          `changed-page re-review failed for ${window.pageNums.join(', ')}: ${message}`,
        );
        partialReasons.push('changed-page re-review could not complete');
        break;
      }
    }
  }

  const finalScan = runDeterministicChecks(proofreadMarkdown, {
    ...(options.assetPaths === undefined ? {} : { assetPaths: options.assetPaths }),
  });
  addIssues(finalScan);

  const headingCount = (value: string): number => (value.match(/^#{1,6}\s/gm) ?? []).length;
  const rawHeadings = headingCount(options.markdown);
  const proofreadHeadings = headingCount(proofreadMarkdown);
  if (proofreadHeadings < rawHeadings) {
    addIssue({
      issueClass: 'markdown-validity',
      category: 'heading-hierarchy',
      classification: 'STRUCTURAL_ISSUE',
      finding: `Proofread Markdown lost headings (${rawHeadings} -> ${proofreadHeadings})`,
      evidenceKind: 'markdown',
      evidence: '',
      markdownExcerpt: '',
      location: { lineStart: 1, lineEnd: 1 },
      proposedAction: 'flag',
      confidence: 'high',
      deterministic: true,
    });
  }

  const markerLines = proofreadMarkdown.split(/\r?\n/);
  for (let index = 0; index < markerLines.length; index += 1) {
    if (!/^<!--\s*pdf-page:\s*\d+\s*-->$/.test((markerLines[index] ?? '').trim())) continue;
    const previous = index > 0 ? (markerLines[index - 1] ?? '') : '';
    if (previous.trim() !== '') {
      addIssue({
        issueClass: 'markdown-validity',
        category: 'page-artifacts',
        classification: 'STRUCTURAL_ISSUE',
        finding: 'Page marker is not at a safe block boundary',
        evidenceKind: 'markdown',
        evidence: (markerLines[index] ?? '').trim(),
        markdownExcerpt: (markerLines[index] ?? '').trim(),
        location: { lineStart: index + 1, lineEnd: index + 1 },
        proposedAction: 'flag',
        confidence: 'high',
        deterministic: true,
      });
    }
  }

  const finalPartial = partialReasons.length > 0;
  const computed = statusFor({
    partialReasons,
    issues,
    referenceMismatch: referenceMismatch && !equivalence.accepted,
    referenceMismatchAccepted: equivalence.accepted,
    forcedTextVisualPages,
    verifierUnavailable,
    dryRun: false,
  });
  const status = computed.status;
  // Keep status honest if any page was never inspected on a non-partial run.
  const inspectedAll =
    reference.pages.length === 0 ||
    reference.pages.every((page) => inspected.has(page.pageNum) || !isContentPage(page));
  let finalStatus = status;
  const finalReasons = [...computed.reasons];
  if (!finalPartial && !inspectedAll && reference.available) {
    finalStatus = 'PARTIAL';
    finalReasons.push('one or more content pages were not inspected');
  }
  const finalDownstream: 'raw' | 'proofread' =
    mode === 'apply' && finalStatus !== 'PARTIAL' ? 'proofread' : 'raw';
  const finalSelected = finalDownstream === 'proofread' ? proofreadMarkdown : options.markdown;

  const sortedIssues = sortIssues(issues).map((issue, index) => ({
    ...issue,
    id: `P${String(index + 1).padStart(3, '0')}`,
  }));

  const unverifiedPages = reference.pages.filter(
    (page) => page.kind === 'vision' && !inspected.has(page.pageNum),
  );

  const summary = summaryFor({
    reference,
    pageMap,
    issues: sortedIssues,
    inspected,
    budget,
    mode,
    status: finalStatus,
    now,
  });
  summary.pagesUnverified = unverifiedPages.length;
  summary.referenceMismatchAccepted = equivalence.accepted;
  summary.manualReviewPages = [
    ...new Set(
      sortedIssues
        .filter((issue) => issue.autoApplied !== true && issue.page !== undefined)
        .map((issue) => issue.page as number),
    ),
  ].sort((a, b) => a - b);

  const metadata = metadataFor({
    options,
    reference,
    markdown: options.markdown,
    proofreadMarkdown,
    pageMap,
    patches: applied.records,
    reviewer,
    verifier,
    now,
  });

  const data: ReportData = {
    documentId: options.documentId,
    rawMarkdown: options.markdown,
    proofreadMarkdown,
    issues: sortedIssues,
    patches: applied.records,
    pageMap,
    summary,
    status: finalStatus,
    statusReasons: finalReasons,
    metadata,
    inspectedPages: [...inspected].sort((a, b) => a - b),
    reInspectedPages: [...reInspected].sort((a, b) => a - b),
    pages: pageArtifacts(reference.pages, pageMap, sortedIssues, inspected, reInspected),
    verificationFailures,
    dryRun: false,
  };

  const artifacts = writeProofreadArtifacts({
    data,
    reviewDir: options.reviewDir,
    proofreadMarkdownPath: options.proofreadMarkdownPath,
    ...(options.reportCopyPath === undefined ? {} : { reportCopyPath: options.reportCopyPath }),
  });

  log(`proofread status: ${finalStatus}`);
  return {
    status: finalStatus,
    statusReasons: finalReasons,
    rawMarkdown: options.markdown,
    proofreadMarkdown,
    selectedMarkdown: finalSelected,
    downstreamSource: finalDownstream,
    partialFallbackUsed: finalDownstream === 'raw' && finalStatus === 'PARTIAL',
    issues: sortedIssues,
    patches: applied.records,
    pageMap,
    summary,
    metadata,
    artifacts,
    spentUsd: budget.spentUsd,
    inspectedPages: data.inspectedPages,
    reInspectedPages: data.reInspectedPages,
    dryRun: false,
  };
}

function summaryFor(input: {
  reference: ReferenceBundle;
  pageMap: PageMap;
  issues: ProofreadIssue[];
  inspected: Set<number>;
  budget: BudgetGuard;
  mode: 'report' | 'apply';
  status: ProofreadStatus;
  now: () => Date;
}): ProofreadSummary {
  const downstreamSource: 'raw' | 'proofread' =
    input.mode === 'apply' && input.status !== 'PARTIAL' ? 'proofread' : 'raw';
  return {
    pagesTotal: input.reference.pages.length,
    pagesInspected: input.inspected.size,
    pagesRoutedText: input.reference.pages.filter((page) => page.kind === 'text').length,
    pagesRoutedVision: input.reference.pages.filter((page) => page.kind === 'vision').length,
    pagesUnverified: 0,
    pagesUnaligned: input.pageMap.unaligned.length,
    pagesMarkerSkipped: input.pageMap.markerSkipped.length,
    referenceMismatch: input.reference.available && input.reference.manifest.referenceMismatch,
    issuesTotal: input.issues.length,
    conversionErrorsCorrected: input.issues.filter((issue) => issue.autoApplied === true).length,
    unresolvedIssues: input.issues.filter((issue) => issue.autoApplied !== true).length,
    manualReviewPages: [],
    costEstimateUsd: input.budget.spentUsd,
    pageMapAvailable: input.pageMap.available,
    downstreamSource,
    partialFallbackUsed: downstreamSource === 'raw' && input.status === 'PARTIAL',
    generatedAt: input.now().toISOString(),
  };
}

function metadataFor(input: {
  options: RunProofreadOptions;
  reference: ReferenceBundle;
  markdown: string;
  proofreadMarkdown: string;
  pageMap: PageMap;
  patches: PatchRecord[];
  reviewer: Pick<ProofreadClient, 'provider' | 'model'>;
  verifier: Pick<ProofreadClient, 'provider' | 'model'>;
  now: () => Date;
}) {
  return {
    documentId: input.options.documentId,
    provider: input.reviewer.provider,
    reviewModel: input.reviewer.model,
    verifierProvider: input.verifier.provider,
    verifierModel: input.verifier.model,
    promptVersion: PROOFREAD_PROMPT_VERSION,
    verifierPromptVersion: PROOFREAD_VERIFIER_PROMPT_VERSION,
    schemaVersion: PROOFREAD_SCHEMA_VERSION,
    referenceMode: input.options.referenceMode ?? 'auto',
    liteparseVersion: input.reference.manifest.liteparseVersion,
    parseOptionsSha256: input.reference.manifest.parseOptionsSha256,
    pdfSha256: input.reference.manifest.pdfSha256,
    rawMarkdownSha256: sha256(input.markdown),
    proofreadMarkdownSha256: sha256(input.proofreadMarkdown),
    pageMapSha256: sha256(stableJson(input.pageMap)),
    patchesSha256: sha256(stableJson(input.patches)),
    generatedAt: input.now().toISOString(),
  };
}

function pageArtifacts(
  referencePages: PageReference[],
  pageMap: PageMap,
  issues: ProofreadIssue[],
  inspected: Set<number>,
  reInspected: Set<number>,
): PageArtifact[] {
  return referencePages.map((page) => {
    const entry = pageMap.pages.find((candidate) => candidate.pageNum === page.pageNum);
    return {
      pageNum: page.pageNum,
      referenceKind: page.kind,
      confidence: entry?.confidence ?? 'unaligned',
      aligned: entry !== undefined,
      inspected: inspected.has(page.pageNum),
      reInspected: reInspected.has(page.pageNum),
      issues: issues.filter((issue) => issue.page === page.pageNum),
    };
  });
}
