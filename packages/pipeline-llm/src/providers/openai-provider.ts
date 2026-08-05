import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import type { LlmProvider, LlmConfig } from '../types.js';

export class OpenAIProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(config: LlmConfig) {
    if (!config.apiKey && !config.baseURL) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY or LLM_API_KEY environment variable.',
      );
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      dangerouslyAllowBrowser: true,
    });
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens;
    this.defaultTemperature = config.temperature;
  }

  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    const response = await this.client.beta.chat.completions.parse({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert curriculum designer. Generate educational content that is clear, accurate, and pedagogically sound. Always output valid structured data matching the requested schema.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: zodResponseFormat(schema, 'result'),
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      temperature: options?.temperature ?? this.defaultTemperature,
    });

    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      const refusal = response.choices[0]?.message?.refusal;
      throw new Error(
        refusal ? `LLM refused to generate: ${refusal}` : 'LLM returned no parsed content',
      );
    }
    return schema.parse(parsed);
  }
}
