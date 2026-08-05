import type { z } from 'zod';

export interface LlmConfig {
  provider: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  /** Custom OpenAI-compatible endpoint (e.g. Ollama: http://localhost:11434/v1). */
  baseURL?: string;
}

export interface LlmProvider {
  generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T>;
}

export function loadConfig(): LlmConfig {
  return {
    provider: process.env.LLM_PROVIDER || 'openai',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    apiKey:
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      '',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    baseURL: process.env.LLM_BASE_URL || undefined,
  };
}
