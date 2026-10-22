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

export const DEFAULT_PROVIDER = 'openai';
export const DEFAULT_FAST_MODEL = 'gpt-4o-mini';
export const DEFAULT_ESCALATION_MODEL = 'gpt-4o';

export interface TierConfig {
  provider: string;
  fast: string;
  escalation: string;
  /**
   * Output token ceiling for chapter extraction and merge calls. Unset means the
   * pipeline defaults (16 384 extraction, 8 192 merge). Lower it when the provider
   * or model caps output below that.
   */
  maxOutputTokens?: number;
}

function positiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Resolve the fast/escalation models following pipeline-llm's `ModelTier` naming
 * convention and `LLM_FAST_MODEL` / `LLM_ESCALATION_MODEL` env vars.
 */
export function resolveTierConfig(
  opts: {
    provider?: string;
    fastModel?: string;
    escalationModel?: string;
    maxOutputTokens?: number;
  } = {},
): TierConfig {
  const config: TierConfig = {
    provider: opts.provider ?? process.env.LLM_PROVIDER ?? DEFAULT_PROVIDER,
    fast: opts.fastModel ?? process.env.LLM_FAST_MODEL ?? DEFAULT_FAST_MODEL,
    escalation:
      opts.escalationModel ?? process.env.LLM_ESCALATION_MODEL ?? DEFAULT_ESCALATION_MODEL,
  };
  const maxOutputTokens = opts.maxOutputTokens ?? positiveInt(process.env.LLM_MAX_OUTPUT_TOKENS);
  if (maxOutputTokens !== undefined) config.maxOutputTokens = maxOutputTokens;
  return config;
}

export interface ModelPrice {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

/** Conservative per-1M-token USD prices, keyed by model name (estimates only). */
export const PRICE_TABLE: Record<string, ModelPrice> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-5.4-mini': { input: 0.25, output: 1.0 },
  'gpt-5.4': { input: 2.5, output: 10 },
  'gemini-2.0-flash-001': { input: 0.1, output: 0.4 },
  'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  // Agnes AI list prices (OpenAI-compatible gateway). `agnes-2.5-flash` and
  // `agnes-2.0-flash` are currently free under a promotion; list prices are used
  // here so budget estimates stay conservative if the promotion ends.
  'agnes-2.5-flash': { input: 0.05, output: 0.15 },
  'agnes-2.0-flash': { input: 0.03, output: 0.15 },
  'agnes-2.5-pro': { input: 0.45, output: 0.9 },
};

export const FALLBACK_PRICE: ModelPrice = { input: 2.5, output: 10 };

export function priceFor(model: string): ModelPrice {
  return PRICE_TABLE[model] ?? FALLBACK_PRICE;
}

/** Rough char-based token estimate (chars / 4), matching the plan's heuristic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
