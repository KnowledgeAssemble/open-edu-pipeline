import type { SourceDocumentModel } from '../source-model/types.js';
import type { KnowledgeModel } from '../knowledge/types.js';
import { resolveEnrichmentConfig } from '../config/stage-config.js';
import type { EnrichmentConfig } from '../config/stage-config.js';

export interface EnrichedItem {
  origin: 'enriched';
  kind: 'concept' | 'statement' | 'glossary' | 'flag';
  note: string;
}

export interface EnrichmentResult {
  origin: 'enriched';
  provider: string;
  model: string;
  generatedAt: string;
  items: EnrichedItem[];
}

export interface EnrichInput {
  doc: SourceDocumentModel;
  knowledge: KnowledgeModel;
  config?: Partial<EnrichmentConfig>;
}

/**
 * Optional LLM enrichment scaffold. Loads `@open-edu/pipeline-llm` dynamically so
 * deterministic runs never pull the LLM dependency. Enriched output is written to
 * `review/` only; it must never be merged into `derivedFrom: "document"` packs.
 */
export async function runEnrichment(input: EnrichInput): Promise<EnrichmentResult> {
  const config = resolveEnrichmentConfig(input.config);
  const mod = await import('@open-edu/pipeline-llm');
  const base = mod.loadConfig();
  mod.createLlmProvider({ ...base, provider: config.provider, model: config.model });

  return {
    origin: 'enriched',
    provider: config.provider,
    model: config.model,
    generatedAt: new Date().toISOString(),
    items: [],
  };
}

/**
 * Explicit provenance guard: enriched concepts may only enter packs whose manifest
 * is not `derivedFrom: "document"`.
 */
export function canMergeEnrichmentIntoPack(derivedFrom?: string): boolean {
  return derivedFrom !== 'document';
}
