export const VERSION = '0.1.0';

export * from './schemas/index.js';
export * from './source-model/types.js';
export {
  SLUG_RE,
  DEFAULT_LESSON_HEADING_RE,
  matchesLessonHeading,
  sectionTypeFor,
  slugify,
  parseMarkdown,
} from './source-model/normalize.js';
export type { LessonHeadingMatcher, ParseMarkdownOptions } from './source-model/normalize.js';
export { segmentMarkdown } from './source-model/segment.js';
export type { LessonDoc, SegmentOptions } from './source-model/segment.js';
export * from './ingest/types.js';
export { deriveManifest } from './ingest/manifest.js';
export { parseToMarkdown, createDefaultRouter } from './parse/index.js';
export { toSourceDocumentModel } from './parse/adapter.js';
export type {
  ExtractionInput,
  ExtractionResult,
  ExtractionManifest,
} from './parse/extraction/types.js';
export * from './knowledge/types.js';
export { parseGlossaryTerm } from './knowledge/glossary.js';
export { extractKnowledge } from './knowledge/extract.js';
export { extractCurriculum, toCurriculum } from './curriculum/extract.js';
export type { CurriculumLikeness } from './curriculum/extract.js';
export * from './emit/write.js';
export * from './validate/pack.js';
export * from './profile/types.js';
export {
  GENERIC_PROFILE_ID,
  registerProfile,
  getProfile,
  listProfiles,
  resolveProfile,
  registerBuiltinProfiles,
} from './profile/registry.js';
export {
  DEFAULT_ENRICHMENT_PROVIDER,
  DEFAULT_ENRICHMENT_MODEL,
  resolveEnrichmentConfig,
  DEFAULT_PROVIDER,
  DEFAULT_FAST_MODEL,
  DEFAULT_ESCALATION_MODEL,
  resolveTierConfig,
  PRICE_TABLE,
  estimateTokens,
  estimateCostUsd,
} from './config/stage-config.js';
export type { EnrichmentConfig, TierConfig, ModelPrice } from './config/stage-config.js';
export { runEnrichment, canMergeEnrichmentIntoPack } from './enrich/index.js';
export type { EnrichmentResult, EnrichedItem, EnrichInput } from './enrich/index.js';

export { segmentChapters, headingMatchScore } from './chapters/segment.js';
export type { Chapter, ChaptersModel, ChapterStrategy } from './chapters/types.js';
export type { SegmentChapterOptions, ChapterSegmentation } from './chapters/segment.js';
export {
  detectTocPages,
  isTocPage,
  parsePageRange,
  parseTocEntries,
  splitPages,
} from './chapters/toc.js';

export type { LlmClient, LlmRequest, LlmResponse } from './llm/client.js';
export { PipelineLlmClient } from './llm/pipeline-llm-client.js';
export { FakeLlmClient, FailingLlmClient } from './llm/fake.js';

export { cacheKey } from './cache/key.js';
export type { CacheKeyInput } from './cache/key.js';
export { CacheStore } from './cache/store.js';
export type { CacheMeta, CacheUsage, CacheHit } from './cache/store.js';

export {
  EXTRACT_PROMPT_VERSION,
  EXTRACT_SCHEMA_VERSION,
  MERGE_PROMPT_VERSION,
  MERGE_SCHEMA_VERSION,
  EXTRACT_STAGE,
  ESCALATION_STAGE,
  MERGE_STAGE,
  ChapterExtractionSchema,
  buildExtractPrompt,
} from './stages/extract.js';
export type { ChapterExtraction } from './stages/extract.js';
export { isGrounded, normalizeWs, stripMarkdown, verifyExtraction } from './stages/verify.js';
export { shouldEscalate } from './stages/escalate.js';
export type {
  VerifiedConcept,
  VerifiedObjective,
  VerifyChapterResult,
  Rejection,
  RejectReason,
} from './stages/verify.js';
export { applyMerge, buildMergePrompt, compactSummary, MergeResultSchema } from './stages/merge.js';
export type { MergeResult, MergeApplyResult, MergeMap, UnresolvedPrereq } from './stages/merge.js';
export { BudgetGuard, estimateCall } from './stages/budget.js';
export type { CallEstimate } from './stages/budget.js';

export { orchestrate } from './run/orchestrate.js';
export type { OrchestrateOptions, OrchestrateResult } from './run/orchestrate.js';
export type { RunReport, ChapterReport, RunTotals } from './run/report.js';
