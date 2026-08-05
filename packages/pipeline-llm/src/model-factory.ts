import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import { loadConfig, type LlmConfig } from './types.js';

export type ProviderCapability = 'streaming' | 'structured-output' | 'tool-calling';

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapability[]> = {
  openai: ['streaming', 'structured-output', 'tool-calling'],
  google: ['streaming', 'structured-output', 'tool-calling'],
  openrouter: ['streaming', 'structured-output', 'tool-calling'],
};

export type ModelTier = 'fast' | 'escalation';

export interface ModelFactoryConfig {
  config: LlmConfig;
  tier?: ModelTier;
}

export interface ModelFactory {
  getModel(tier?: ModelTier): LanguageModel;
  getCapabilities(): ProviderCapability[];
  hasCapability(cap: ProviderCapability): boolean;
}

class ModelFactoryImpl implements ModelFactory {
  private fastModel: LanguageModel | null = null;
  private escalationModel: LanguageModel | null = null;
  private config: LlmConfig;

  constructor(config: LlmConfig) {
    this.config = config;
  }

  private createProvider(): (modelId: string) => LanguageModel {
    const { provider, apiKey, baseURL } = this.config;
    switch (provider) {
      case 'openai': {
        const openai = createOpenAI({ apiKey, baseURL });
        // Custom OpenAI-compatible endpoints (e.g. Ollama) expose the Chat
        // Completions API, not the Responses API. The default provider method
        // targets Responses, so route custom-baseURL traffic through .chat().
        return (modelId) => (baseURL ? openai.chat(modelId) : openai(modelId)) as LanguageModel;
      }
      case 'google':
        return createGoogleGenerativeAI({ apiKey }) as (modelId: string) => LanguageModel;
      case 'openrouter': {
        return createOpenRouter({ apiKey }) as (modelId: string) => LanguageModel;
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  getModel(tier: ModelTier = 'fast'): LanguageModel {
    if (tier === 'fast' && this.fastModel) return this.fastModel;
    if (tier === 'escalation' && this.escalationModel) return this.escalationModel;

    const p = this.createProvider();
    const modelId = this.resolveModelId(tier);
    const model = p(modelId);

    if (tier === 'fast') this.fastModel = model;
    else this.escalationModel = model;

    return model;
  }

  private resolveModelId(tier: ModelTier): string {
    if (tier === 'fast' && process.env.LLM_FAST_MODEL) {
      return process.env.LLM_FAST_MODEL;
    }
    if (tier === 'escalation' && process.env.LLM_ESCALATION_MODEL) {
      return process.env.LLM_ESCALATION_MODEL;
    }

    if (tier === 'escalation') {
      return this.config.model;
    }

    // Custom OpenAI-compatible endpoints (e.g. Ollama) don't share the hosted
    // provider's model registry, so fall back to the configured model rather
    // than provider-specific defaults like gpt-4o-mini.
    if (this.config.baseURL) {
      return this.config.model;
    }

    const { provider } = this.config;
    if (provider === 'openai') return 'gpt-4o-mini';
    if (provider === 'google') return 'gemini-2.0-flash-001';
    return this.config.model;
  }

  getCapabilities(): ProviderCapability[] {
    return PROVIDER_CAPABILITIES[this.config.provider] ?? [];
  }

  hasCapability(cap: ProviderCapability): boolean {
    return this.getCapabilities().includes(cap);
  }
}

export function createModelFactory(config: LlmConfig): ModelFactory {
  return new ModelFactoryImpl(config);
}

export function createModelFactoryFromEnv(): ModelFactory {
  return createModelFactory(loadConfig());
}
