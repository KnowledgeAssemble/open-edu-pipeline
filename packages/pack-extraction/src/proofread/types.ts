import { z } from 'zod';

/** Versions recorded with every cache entry, artifact, and report. */
export const PROOFREAD_PROMPT_VERSION = 'proofread-review-v1';
export const PROOFREAD_VERIFIER_PROMPT_VERSION = 'proofread-verify-v1';
export const PROOFREAD_SCHEMA_VERSION = 'proofread-schema-v1';

export const DEFAULT_WINDOW_PAGES = 2;
export const DEFAULT_SCREENSHOT_DPI = 150;
export const MIN_SCREENSHOT_DPI = 110;
export const LARGE_PAGE_CHARS = 12_000;
export const MAX_AUTO_PATCH_CHARS = 2_000;
export const MAX_AUTO_PATCH_LINES = 40;
export const DEFAULT_PROOFREAD_BUDGET_USD = 1.0;
export const DEFAULT_PROOFREAD_MODEL = 'deepseek4-flash';

export const PROOFREAD_PAGE_MARKER_RE = /^<!--\s*pdf-page:\s*\d+\s*-->$/;

export const PatchBaseSchema = z.object({
  exact: z.string(),
  before: z.string().default(''),
  after: z.string().default(''),
  origin: z.enum(['llm', 'page-map']).default('llm'),
  order: z.number().int().optional(),
});

export const PatchSchema = z.discriminatedUnion('op', [
  PatchBaseSchema.extend({ op: z.literal('replace'), replacement: z.string() }),
  PatchBaseSchema.extend({ op: z.literal('insert-before'), text: z.string() }),
  PatchBaseSchema.extend({ op: z.literal('insert-after'), text: z.string() }),
  PatchBaseSchema.extend({ op: z.literal('delete') }),
]);

export type Patch = z.infer<typeof PatchSchema>;

export const IssueCategorySchema = z.enum([
  'missing-content',
  'duplicated-content',
  'reading-order',
  'heading-hierarchy',
  'broken-paragraph',
  'list-structure',
  'table-structure',
  'math-notation',
  'numbers-dates-units',
  'punctuation',
  'page-artifacts',
  'ocr-error',
  'association-error',
  'missing-image-caption',
  'markdown-syntax',
  'component-order',
]);

export type IssueCategory = z.infer<typeof IssueCategorySchema>;

export const IssueClassSchema = z.enum(['source-fidelity', 'markdown-validity', 'source-error']);
export type IssueClass = z.infer<typeof IssueClassSchema>;

export const IssueClassificationSchema = z.enum([
  'CONVERSION_ERROR',
  'POSSIBLE_SOURCE_ERROR',
  'STRUCTURAL_ISSUE',
  'UNVERIFIABLE',
]);
export type IssueClassification = z.infer<typeof IssueClassificationSchema>;

export const EvidenceKindSchema = z.enum(['pdf-text', 'pdf-visual', 'markdown']);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ProofreadActionSchema = z.enum([
  'replace',
  'insert-before',
  'insert-after',
  'delete',
  'move',
  'flag',
]);
export type ProofreadAction = z.infer<typeof ProofreadActionSchema>;

export const IssueLocationSchema = z.object({
  heading: z.string().optional(),
  lineStart: z.number().int().nonnegative().default(0),
  lineEnd: z.number().int().nonnegative().default(0),
});
export type IssueLocation = z.infer<typeof IssueLocationSchema>;

export const ProofreadIssueSchema = z.object({
  id: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  issueClass: IssueClassSchema,
  category: IssueCategorySchema,
  classification: IssueClassificationSchema,
  finding: z.string(),
  evidenceKind: EvidenceKindSchema,
  evidence: z.string(),
  markdownExcerpt: z.string().default(''),
  location: IssueLocationSchema,
  proposedAction: ProofreadActionSchema,
  patch: PatchSchema.optional(),
  confidence: ConfidenceSchema,
  autoApplied: z.boolean().optional(),
  verification: z.enum(['accepted', 'rejected', 'not-run']).optional(),
});
export type ProofreadIssue = z.infer<typeof ProofreadIssueSchema>;

export const PagePresenceSchema = z.object({
  pageNum: z.number().int().positive(),
  status: z.enum(['present', 'partial', 'missing', 'duplicated']),
  note: z.string().optional(),
});
export type PagePresence = z.infer<typeof PagePresenceSchema>;

export const PageReviewSchema = z.object({
  pages: z.array(z.number().int().positive()).default([]),
  pagePresence: z.array(PagePresenceSchema).default([]),
  issues: z.array(ProofreadIssueSchema).default([]),
});
export type PageReview = z.infer<typeof PageReviewSchema>;

export const VerificationResponseSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  reason: z.string().default(''),
  evidence: z.string().default(''),
});
export type VerificationResponse = z.infer<typeof VerificationResponseSchema>;

export const PageMapEntrySchema = z.object({
  pageNum: z.number().int().positive(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  confidence: ConfidenceSchema,
  method: z.string(),
  referenceKind: z.enum(['text', 'vision']),
});
export type PageMapEntry = z.infer<typeof PageMapEntrySchema>;

export const PageMapSchema = z.object({
  available: z.boolean(),
  pdfSha256: z.string().default(''),
  rawMarkdownSha256: z.string().default(''),
  liteparseVersion: z.string().default('unknown'),
  pages: z.array(PageMapEntrySchema).default([]),
  unaligned: z.array(z.number().int().positive()).default([]),
  markerSkipped: z.array(z.number().int().positive()).default([]),
});
export type PageMap = z.infer<typeof PageMapSchema>;

export const ProofreadStatusSchema = z.enum([
  'PASS',
  'PASS_WITH_WARNINGS',
  'NEEDS_REVIEW',
  'PARTIAL',
]);
export type ProofreadStatus = z.infer<typeof ProofreadStatusSchema>;

const STATUS_RANK: Record<ProofreadStatus, number> = {
  PASS: 0,
  PASS_WITH_WARNINGS: 1,
  NEEDS_REVIEW: 2,
  PARTIAL: 3,
};

/** Strict precedence: PARTIAL > NEEDS_REVIEW > PASS_WITH_WARNINGS > PASS. */
export function highestStatus(...statuses: ProofreadStatus[]): ProofreadStatus {
  return statuses.reduce<ProofreadStatus>(
    (highest, status) => (STATUS_RANK[status] > STATUS_RANK[highest] ? status : highest),
    'PASS',
  );
}

export type ReferenceKind = 'text' | 'vision';
export type ReferenceMode = 'auto' | 'vision' | 'text';

export interface PageQuality {
  chars: number;
  replacementChars: number;
}

export interface PageReference {
  pageNum: number;
  kind: ReferenceKind;
  text: string;
  pageMarkdown: string;
  complexity?: unknown;
  screenshotPath?: string;
  screenshotDpi?: number;
  quality: PageQuality;
  hasScreenshot: boolean;
}

export interface ReferenceManifest {
  pdfSha256: string;
  rawMarkdownSha256: string;
  liteparseVersion: string;
  parseOptions: Record<string, unknown>;
  parseOptionsSha256: string;
  screenshotDpi: number;
  createdAt: string;
  referenceMismatch: boolean;
}

export interface ReferenceBundle {
  available: boolean;
  pages: PageReference[];
  manifest: ReferenceManifest;
}

export type DeterministicFinding = ProofreadIssue;

export interface PageWindow {
  /** Pages inspected by this call (not context pages). */
  pageNums: number[];
  kind: ReferenceKind;
  pages: PageReference[];
  contextPages: PageReference[];
  /** Raw Markdown slice with 1-based global line numbers. */
  markdown: string;
  startLine: number;
  endLine: number;
  /** Present when a large page had to be split. */
  part?: number;
  parts?: number;
}

export type PatchRecordStatus = 'applied' | 'rejected';

export interface PatchRecord {
  patch: Patch;
  status: PatchRecordStatus;
  reason?: string;
  lineStart?: number;
  lineEnd?: number;
  order: number;
}

export interface ProofreadSummary {
  pagesTotal: number;
  pagesInspected: number;
  pagesRoutedText: number;
  pagesRoutedVision: number;
  pagesUnverified: number;
  pagesUnaligned: number;
  pagesMarkerSkipped: number;
  referenceMismatch: boolean;
  issuesTotal: number;
  conversionErrorsCorrected: number;
  unresolvedIssues: number;
  manualReviewPages: number[];
  costEstimateUsd: number;
  pageMapAvailable: boolean;
  downstreamSource: 'raw' | 'proofread';
  partialFallbackUsed: boolean;
  generatedAt: string;
}

export interface ProofreadRunMetadata {
  documentId: string;
  provider: string;
  reviewModel: string;
  verifierProvider: string;
  verifierModel: string;
  promptVersion: string;
  verifierPromptVersion: string;
  schemaVersion: string;
  referenceMode: ReferenceMode;
  liteparseVersion: string;
  parseOptionsSha256: string;
  pdfSha256: string;
  rawMarkdownSha256: string;
  proofreadMarkdownSha256: string;
  pageMapSha256: string;
  patchesSha256: string;
  generatedAt: string;
}

export interface ProofreadResult {
  status: ProofreadStatus;
  statusReasons: string[];
  rawMarkdown: string;
  proofreadMarkdown: string;
  /** What a downstream stage should use according to mode/status. */
  selectedMarkdown: string;
  downstreamSource: 'raw' | 'proofread';
  partialFallbackUsed: boolean;
  issues: ProofreadIssue[];
  patches: PatchRecord[];
  pageMap: PageMap;
  summary: ProofreadSummary;
  metadata: ProofreadRunMetadata;
  artifacts: {
    proofreadMarkdownPath?: string;
    reportPath?: string;
    issuesPath?: string;
    patchesPath?: string;
    pageMapPath?: string;
    statusPath?: string;
    pagesDir?: string;
    dryRunPath?: string;
  };
  spentUsd: number;
  inspectedPages: number[];
  reInspectedPages: number[];
  dryRun: boolean;
}

export interface VerificationRequest {
  patch: Patch;
  issue: ProofreadIssue;
  original: string;
  corrected: string;
  pageReference?: PageReference;
  prompt: string;
}

export interface ProofreadClient {
  readonly provider: string;
  readonly model: string;
  readonly supportsImages?: boolean;
  review(request: { prompt: string; window: PageWindow }): Promise<PageReview>;
  verify(request: VerificationRequest): Promise<VerificationResponse>;
}
