import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  PageMap,
  PatchRecord,
  ProofreadIssue,
  ProofreadRunMetadata,
  ProofreadStatus,
  ProofreadSummary,
} from './types.js';

export interface PageArtifact {
  pageNum: number;
  referenceKind: 'text' | 'vision';
  confidence: string;
  aligned: boolean;
  inspected: boolean;
  reInspected: boolean;
  issues: ProofreadIssue[];
}

export interface ReportData {
  documentId: string;
  rawMarkdown: string;
  proofreadMarkdown: string;
  issues: ProofreadIssue[];
  patches: PatchRecord[];
  pageMap: PageMap;
  summary: ProofreadSummary;
  status: ProofreadStatus;
  statusReasons: string[];
  metadata: ProofreadRunMetadata;
  inspectedPages: number[];
  reInspectedPages: number[];
  pages: PageArtifact[];
  verificationFailures: string[];
  dryRun: boolean;
}

export interface ProofreadArtifactPaths {
  proofreadMarkdownPath?: string;
  reportPath?: string;
  reportCopyPath?: string;
  issuesPath?: string;
  patchesPath?: string;
  pageMapPath?: string;
  statusPath?: string;
  pagesDir?: string;
  dryRunPath?: string;
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function tableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function issueTable(issues: ProofreadIssue[]): string {
  if (issues.length === 0) return '_No findings._';
  const rows = issues.map((issue, index) => {
    const id = issue.id ?? `P${String(index + 1).padStart(3, '0')}`;
    const location =
      issue.page === undefined
        ? `lines ${issue.location.lineStart}-${issue.location.lineEnd}`
        : String(issue.page);
    const action = issue.autoApplied === true ? 'Auto-corrected' : 'Flagged';
    return `| ${id} | ${location} | ${issue.category} | ${issue.classification} | ${tableCell(issue.finding)} | ${action} | ${issue.confidence} |`;
  });
  return [
    '| ID | Page / line | Category | Classification | Finding | Action | Confidence |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function renderReport(data: ReportData): string {
  const inspected = data.inspectedPages.length === 0 ? 'none' : data.inspectedPages.join(', ');
  const notInspected = data.pageMap.pages
    .map((page) => page.pageNum)
    .filter((page) => !data.inspectedPages.includes(page));
  const material = data.issues.filter(
    (issue) => issue.classification !== 'UNVERIFIABLE' || issue.issueClass === 'source-fidelity',
  );
  const corrected = data.issues.filter((issue) => issue.autoApplied === true);
  const sourceErrors = data.issues.filter(
    (issue) => issue.classification === 'POSSIBLE_SOURCE_ERROR',
  );
  const unresolved = data.issues.filter((issue) => issue.autoApplied !== true);
  const manual = new Set<number>();
  for (const issue of unresolved) {
    if (issue.page !== undefined) manual.add(issue.page);
  }

  return [
    `# Proofread report: ${data.documentId}`,
    '',
    '## 1. Document identification',
    '',
    `- Document ID: \`${data.documentId}\``,
    `- PDF SHA-256: \`${data.metadata.pdfSha256 || 'n/a'}\``,
    `- Raw Markdown SHA-256: \`${data.metadata.rawMarkdownSha256}\``,
    `- Proofread Markdown SHA-256: \`${data.metadata.proofreadMarkdownSha256}\``,
    `- LitParse version: \`${data.metadata.liteparseVersion}\``,
    `- Reference mode: \`${data.metadata.referenceMode}\``,
    `- Generated: ${data.metadata.generatedAt}`,
    data.dryRun ? '- **Dry run**: no review or verification calls were made.' : '',
    '',
    '## 2. Pages inspected',
    '',
    `- Pages total: ${data.summary.pagesTotal}`,
    `- Inspected: ${inspected}`,
    `- Re-inspected after changes: ${data.reInspectedPages.length === 0 ? 'none' : data.reInspectedPages.join(', ')}`,
    `- Not inspected: ${notInspected.length === 0 ? 'none' : notInspected.join(', ')}`,
    `- Routed to text: ${data.summary.pagesRoutedText}; routed to vision: ${data.summary.pagesRoutedVision}`,
    `- Unverified: ${data.summary.pagesUnverified}; unaligned: ${data.summary.pagesUnaligned}`,
    '',
    '## 3. Reference provenance',
    '',
    `- LitParse version: \`${data.metadata.liteparseVersion}\``,
    `- Parse options SHA-256: \`${data.metadata.parseOptionsSha256 || 'n/a'}\``,
    `- Reference mismatch: ${data.summary.referenceMismatch ? 'yes' : 'no'}`,
    `- Deep per-page diff accepted equivalence: ${data.summary.referenceMismatchAccepted ? 'yes' : 'no'}`,
    '',
    '## 4. Confirmed corrections',
    '',
    corrected.length === 0 ? '_No corrections were auto-applied._' : issueTable(corrected),
    '',
    '## 5. Conversion issues found',
    '',
    issueTable(material.filter((issue) => issue.classification === 'CONVERSION_ERROR')),
    '',
    '## 6. Possible source errors',
    '',
    sourceErrors.length === 0 ? '_None._' : issueTable(sourceErrors),
    '',
    '## 7. Unresolved ambiguities',
    '',
    issueTable(
      data.issues.filter(
        (issue) =>
          issue.classification === 'UNVERIFIABLE' || issue.classification === 'STRUCTURAL_ISSUE',
      ),
    ),
    '',
    '## 8. Tables, diagrams, or images requiring manual inspection',
    '',
    data.pages.filter(
      (page) =>
        page.referenceKind === 'vision' &&
        (!page.inspected || page.issues.some((issue) => issue.category === 'table-structure')),
    ).length === 0
      ? '_None recorded._'
      : data.pages
          .filter(
            (page) =>
              page.referenceKind === 'vision' &&
              (!page.inspected ||
                page.issues.some((issue) => issue.category === 'table-structure')),
          )
          .map(
            (page) =>
              `- Page ${page.pageNum} (${page.inspected ? 'needs manual table/figure review' : 'not inspected'})`,
          )
          .join('\n'),
    '',
    '## 9. Overall review status',
    '',
    `**${data.status}**`,
    '',
    data.statusReasons.length === 0
      ? '_No status notes._'
      : data.statusReasons.map((reason) => `- ${reason}`).join('\n'),
    '',
    '## 10. Verification',
    '',
    `- Review model: ${data.metadata.reviewModel} (${data.metadata.provider})`,
    `- Verifier model: ${data.metadata.verifierModel} (${data.metadata.verifierProvider})`,
    `- Verifier prompt version: ${data.metadata.verifierPromptVersion}`,
    `- Verification failures: ${data.verificationFailures.length === 0 ? 'none' : data.verificationFailures.join('; ')}`,
    '',
    '## 11. Downstream selection',
    '',
    `- Downstream source: \`${data.summary.downstreamSource}\``,
    `- Partial fallback used: ${data.summary.partialFallbackUsed ? 'yes' : 'no'}`,
    '',
    '## 12. Cost and cache',
    '',
    `- Estimated cost (USD): ${data.summary.costEstimateUsd.toFixed(4)}`,
    `- Issue log: \`${join('review', 'proofread', 'issues.json')}\``,
    `- Patch log: \`${join('review', 'proofread', 'patches.json')}\``,
    `- Page map: \`${join('review', 'proofread', 'page-map.json')}\``,
    '',
    '## Issue log',
    '',
    issueTable(data.issues),
    '',
    `_Manual review pages: ${manual.size === 0 ? 'none' : [...manual].sort((a, b) => a - b).join(', ')}_`,
    '',
  ]
    .join('\n')
    .concat('\n');
}

export interface WriteArtifactsOptions {
  data: ReportData;
  reviewDir: string;
  proofreadMarkdownPath: string;
  reportCopyPath?: string;
  dryRun?: unknown;
}

export function writeProofreadArtifacts(options: WriteArtifactsOptions): ProofreadArtifactPaths {
  const { data, reviewDir } = options;
  const pagesDir = join(reviewDir, 'pages');
  mkdirSync(pagesDir, { recursive: true });
  mkdirSync(dirname(options.proofreadMarkdownPath), { recursive: true });
  writeFileSync(options.proofreadMarkdownPath, data.proofreadMarkdown, 'utf8');

  const issuesPath = join(reviewDir, 'issues.json');
  writeJsonFile(issuesPath, {
    ...data.metadata,
    status: data.status,
    statusReasons: data.statusReasons,
    issues: data.issues,
  });

  const patchesPath = join(reviewDir, 'patches.json');
  writeJsonFile(patchesPath, {
    rawMarkdownSha256: data.metadata.rawMarkdownSha256,
    proofreadMarkdownSha256: data.metadata.proofreadMarkdownSha256,
    patches: data.patches,
  });

  const pageMapPath = join(reviewDir, 'page-map.json');
  writeJsonFile(pageMapPath, data.pageMap);

  const statusPath = join(reviewDir, 'status.json');
  writeJsonFile(statusPath, {
    status: data.status,
    statusReasons: data.statusReasons,
    ...data.summary,
  });

  for (const page of data.pages) {
    writeJsonFile(join(pagesDir, `${page.pageNum}.json`), page);
  }

  const report = renderReport(data);
  const reportPath = join(reviewDir, 'proofread-report.md');
  writeFileSync(reportPath, report, 'utf8');
  if (options.reportCopyPath !== undefined) {
    mkdirSync(dirname(options.reportCopyPath), { recursive: true });
    writeFileSync(options.reportCopyPath, report, 'utf8');
  }

  let dryRunPath: string | undefined;
  if (options.dryRun !== undefined) {
    dryRunPath = join(reviewDir, 'dry-run.json');
    writeJsonFile(dryRunPath, options.dryRun);
  }

  return {
    proofreadMarkdownPath: options.proofreadMarkdownPath,
    reportPath,
    reportCopyPath: options.reportCopyPath,
    issuesPath,
    patchesPath,
    pageMapPath,
    statusPath,
    pagesDir,
    dryRunPath,
  };
}
