export const VERSION = '0.1.0';

export * from './schemas/index.js';
export * from './source-model/types.js';
export { SLUG_RE, sectionTypeFor, slugify, parseMarkdown } from './source-model/normalize.js';
export * from './ingest/types.js';
export * from './knowledge/types.js';
export { parseGlossaryTerm } from './knowledge/glossary.js';
export { extractKnowledge } from './knowledge/extract.js';
export { extractCurriculum, toCurriculum } from './curriculum/extract.js';
export type { CurriculumLikeness } from './curriculum/extract.js';
export * from './emit/write.js';
export * from './validate/pack.js';
