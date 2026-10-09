export interface EnrichmentConfig {
  provider: string;
  model: string;
}

export const DEFAULT_ENRICHMENT_PROVIDER = 'openai';
export const DEFAULT_ENRICHMENT_MODEL = 'gpt-4o-mini';

/**
 * Resolve the optional LLM provider/model for `--enrich`. Deterministic extraction
 * never consults this; it is only used when enrichment is explicitly requested.
 */
export function resolveEnrichmentConfig(
  opts: { provider?: string; model?: string } = {},
): EnrichmentConfig {
  return {
    provider: opts.provider ?? process.env.LLM_PROVIDER ?? DEFAULT_ENRICHMENT_PROVIDER,
    model: opts.model ?? process.env.LLM_MODEL ?? DEFAULT_ENRICHMENT_MODEL,
  };
}
