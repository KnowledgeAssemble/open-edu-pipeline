export type { LlmConfig, LlmProvider } from './types.js';
export { loadConfig } from './types.js';
export { OpenAIProvider } from './providers/openai-provider.js';
export { OpenRouterProvider } from './providers/openrouter-provider.js';
export { LlmRouter, legacyAdapter } from './router.js';
export type { StructuredResult } from './router.js';
export { LLM_STAGES, DEFAULT_STAGE_CONFIGS, isLlmStage, assertLlmStage } from './stages.js';
export type { LlmStage, LlmStageConfig, LlmStageConfigs } from './stages.js';

export { createModelFactory, createModelFactoryFromEnv } from './model-factory.js';
export type {
  ModelFactory,
  ModelFactoryConfig,
  ModelTier,
  ProviderCapability,
} from './model-factory.js';
export { PROVIDER_CAPABILITIES } from './model-factory.js';

import type { LlmConfig } from './types.js';
import { loadConfig } from './types.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { OpenRouterProvider } from './providers/openrouter-provider.js';

export function createLlmProvider(config?: LlmConfig): OpenAIProvider | OpenRouterProvider {
  const cfg = config ?? loadConfig();

  switch (cfg.provider) {
    case 'openai':
      return new OpenAIProvider(cfg);
    case 'openrouter':
      return new OpenRouterProvider(cfg);
    default:
      throw new Error(`Unknown LLM provider: ${cfg.provider}. Supported: openai, openrouter`);
  }
}
