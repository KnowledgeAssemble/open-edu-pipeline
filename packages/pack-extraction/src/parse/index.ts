import type { ExtractionInput, ExtractionResult } from './extraction/types.js';
import { ExtractorRouter } from './extraction/router.js';
import { LiteParseExtractor } from './extraction/liteparse-extractor.js';
import { ZipHandler } from './extraction/zip-handler.js';
import { MarkdownNormalizer } from './extraction/normalizer.js';

export function createDefaultRouter(): ExtractorRouter {
  const router = new ExtractorRouter();
  router.register(new LiteParseExtractor());
  return router;
}

/**
 * Parse any supported document (PDF/DOCX/PPTX/images/zip) to normalized markdown.
 * Markdown/plain-text files pass through the liteparse extractor's direct read path.
 */
export async function parseToMarkdown(
  filePath: string,
  options?: ExtractionInput['options'],
): Promise<ExtractionResult> {
  const input: ExtractionInput = { filePath, options };
  const router = createDefaultRouter();
  const normalizer = new MarkdownNormalizer();

  if (filePath.toLowerCase().endsWith('.zip')) {
    const raw = await new ZipHandler(router).extract(input);
    return { ...raw, contentMd: normalizer.normalize(raw.contentMd) };
  }

  const extractor = router.resolve(input);
  if (!extractor) {
    throw new Error(`No extractor found for: ${filePath}`);
  }

  const raw = await extractor.extract(input);
  return { ...raw, contentMd: normalizer.normalize(raw.contentMd) };
}

export { ExtractorRouter } from './extraction/router.js';
export { LiteParseExtractor } from './extraction/liteparse-extractor.js';
export { ZipHandler } from './extraction/zip-handler.js';
export { MarkdownNormalizer } from './extraction/normalizer.js';
export type { Extractor } from './extraction/interface.js';
export type {
  ExtractionInput,
  ExtractionResult,
  ExtractionManifest,
  AssetInfo,
} from './extraction/types.js';
