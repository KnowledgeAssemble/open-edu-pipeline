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
} from './config/stage-config.js';
export type { EnrichmentConfig } from './config/stage-config.js';
export { runEnrichment, canMergeEnrichmentIntoPack } from './enrich/index.js';
export type { EnrichmentResult, EnrichedItem, EnrichInput } from './enrich/index.js';
