import type { ExtractionInput, ExtractionResult } from './types.js';
import { ExtractionInputSchema } from './types.js';
import { ExtractorRouter } from './router.js';
import { LiteParseExtractor } from './liteparse-extractor.js';
import { ZipHandler } from './zip-handler.js';
import { MarkdownNormalizer } from './normalizer.js';
import { ExtractionLogger } from './logger.js';
import type { Extractor } from './interface.js';

let defaultRouter: ExtractorRouter | null = null;
let normalizer: MarkdownNormalizer | null = null;
let logger: ExtractionLogger | null = null;

export function createDefaultRouter(): ExtractorRouter {
  const router = new ExtractorRouter();
  router.register(new LiteParseExtractor());
  return router;
}

export function getDefaultRouter(): ExtractorRouter {
  if (!defaultRouter) {
    defaultRouter = createDefaultRouter();
  }
  return defaultRouter;
}

export function registerExtractor(extractor: Extractor): void {
  getDefaultRouter().register(extractor);
}

export function getNormalizer(): MarkdownNormalizer {
  if (!normalizer) {
    normalizer = new MarkdownNormalizer();
  }
  return normalizer;
}

export function getLogger(): ExtractionLogger {
  if (!logger) {
    logger = new ExtractionLogger('console', false);
  }
  return logger;
}

export function setLogger(newLogger: ExtractionLogger): void {
  logger = newLogger;
}

export async function runExtraction(input: ExtractionInput): Promise<ExtractionResult> {
  const validatedInput = ExtractionInputSchema.parse(input);
  const router = getDefaultRouter();
  const norm = getNormalizer();

  if (validatedInput.filePath.toLowerCase().endsWith('.zip')) {
    const zipHandler = new ZipHandler(router);
    const rawResult = await zipHandler.extract(validatedInput);
    return {
      ...rawResult,
      contentMd: norm.normalize(rawResult.contentMd),
    };
  }

  const extractor = router.resolve(validatedInput);
  if (!extractor) {
    throw new Error(`No extractor found for: ${validatedInput.filePath}`);
  }

  const startTime = Date.now();
  const log = getLogger();

  try {
    const rawResult = await extractor.extract(validatedInput);
    const durationMs = Date.now() - startTime;
    log.info(extractor.id, validatedInput.filePath, durationMs, 'Extraction complete');

    return {
      ...rawResult,
      contentMd: norm.normalize(rawResult.contentMd),
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    log.error(extractor.id, validatedInput.filePath, durationMs, String(err));
    throw err;
  }
}

export { ExtractorRouter } from './router.js';
export { MarkdownNormalizer } from './normalizer.js';
export { ExtractionLogger } from './logger.js';
export { LiteParseExtractor } from './liteparse-extractor.js';
export { ZipHandler } from './zip-handler.js';
export { toPageContent } from './adapter.js';
export type { Extractor } from './interface.js';
export type {
  ExtractionInput,
  ExtractionResult,
  ExtractionManifest,
  ExtractionError,
  AssetInfo,
  ComplexityLevel,
} from './types.js';
