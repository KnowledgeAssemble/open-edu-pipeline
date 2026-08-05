import type { ExtractionInput, ExtractionResult } from './types.js';

export interface Extractor {
  readonly id: string;

  readonly supportedExtensions: string[];

  canHandle(input: ExtractionInput): boolean;

  extract(input: ExtractionInput): Promise<ExtractionResult>;
}
