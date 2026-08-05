import type { z } from 'zod';
import type { LlmProvider } from './types.js';
import type { LlmStage, LlmStageConfigs, LlmStageConfig } from './stages.js';
import { DEFAULT_STAGE_CONFIGS } from './stages.js';
import { createLlmProvider } from './index.js';
import type { LlmConfig } from './types.js';

export interface StructuredResult<T> {
  data: T;
  stage: LlmStage;
  provider: string;
  model: string;
}

export class LlmRouter {
  private stageConfigs: LlmStageConfigs;
  private providerCache = new Map<string, LlmProvider>();

  constructor(stageConfigs?: Partial<LlmStageConfigs>) {
    this.stageConfigs = { ...DEFAULT_STAGE_CONFIGS };
    if (stageConfigs) {
      for (const [key, value] of Object.entries(stageConfigs)) {
        if (value) {
          const stage = key as LlmStage;
          this.stageConfigs[stage] = { ...this.stageConfigs[stage], ...value };
        }
      }
    }
  }

  updateStageConfig(stage: LlmStage, config: Partial<LlmStageConfig>): void {
    this.stageConfigs[stage] = { ...this.stageConfigs[stage], ...config };
    this.providerCache.clear();
  }

  getStageConfig(stage: LlmStage): LlmStageConfig {
    return this.stageConfigs[stage];
  }

  private providerKey(config: LlmStageConfig): string {
    return `${config.provider}:${config.model}`;
  }

  private getProvider(stage: LlmStage): LlmProvider {
    const config = this.stageConfigs[stage];
    const key = this.providerKey(config);

    let provider = this.providerCache.get(key);
    if (!provider) {
      const llmConfig: LlmConfig = {
        provider: config.provider,
        model: config.model,
        apiKey:
          process.env.LLM_API_KEY ||
          process.env.OPENAI_API_KEY ||
          process.env.ANTHROPIC_API_KEY ||
          process.env.OPENROUTER_API_KEY ||
          '',
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        baseURL: process.env.LLM_BASE_URL || undefined,
      };
      provider = createLlmProvider(llmConfig);
      this.providerCache.set(key, provider);
    }
    return provider;
  }

  async generateStructured<T>(
    stage: LlmStage,
    prompt: string,
    schema: z.ZodType<T>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<StructuredResult<T>> {
    const config = this.stageConfigs[stage];
    const provider = this.getProvider(stage);

    try {
      const data = await provider.generateStructured(prompt, schema, options);
      return { data, stage, provider: config.provider, model: config.model };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `LLM stage "${stage}" failed (provider=${config.provider}, model=${config.model}): ${message}`,
      );
    }
  }

  async generateStructuredRaw<T>(
    stage: LlmStage,
    prompt: string,
    schema: z.ZodType<T>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    const result = await this.generateStructured(stage, prompt, schema, options);
    return result.data;
  }
}

export function legacyAdapter(router: LlmRouter, stage: LlmStage): LlmProvider {
  return {
    async generateStructured<T>(
      prompt: string,
      schema: z.ZodType<T>,
      options?: { temperature?: number; maxTokens?: number },
    ): Promise<T> {
      return router.generateStructuredRaw(stage, prompt, schema, options);
    },
  };
}
