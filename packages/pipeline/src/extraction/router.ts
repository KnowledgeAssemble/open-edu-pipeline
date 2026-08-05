import type { Extractor } from './interface.js';
import type { ExtractionInput } from './types.js';

export class ExtractorRouter {
  private extractors = new Map<string, Extractor>();

  register(extractor: Extractor): void {
    this.extractors.set(extractor.id, extractor);
  }

  resolve(input: ExtractionInput): Extractor | null {
    if (input.extractorId) {
      return this.extractors.get(input.extractorId) ?? null;
    }

    for (const extractor of this.extractors.values()) {
      if (extractor.canHandle(input)) {
        return extractor;
      }
    }

    return null;
  }

  listExtractors(): string[] {
    return Array.from(this.extractors.keys());
  }

  clear(): void {
    this.extractors.clear();
  }
}
