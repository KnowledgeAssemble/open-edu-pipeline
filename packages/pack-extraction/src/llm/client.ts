import type { z } from 'zod';
import type { LlmStage, ModelTier } from '@open-edu/pipeline-llm';

export interface LlmRequest<T> {
  stage: LlmStage;
  tier: ModelTier;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  /** Output token ceiling; long chapters need more than the stage default. */
  maxTokens?: number;
}

export interface LlmResponse<T> {
  data: T;
  model: string;
  provider: string;
}

/**
 * Single structured-call seam. The caller computes its own char-based token
 * estimate because `@open-edu/pipeline-llm` surfaces no token usage.
 */
export interface LlmClient {
  generateStructured<T>(request: LlmRequest<T>): Promise<LlmResponse<T>>;
}
