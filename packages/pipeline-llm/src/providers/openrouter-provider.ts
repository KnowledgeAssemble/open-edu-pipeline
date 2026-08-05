import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import type { LlmProvider, LlmConfig } from '../types.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;

  constructor(config: LlmConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenRouter API key is required. Set LLM_API_KEY or OPENROUTER_API_KEY environment variable.',
      );
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/spatnaik1982/open-edu',
        'X-Title': 'OpenEdu',
      },
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
    try {
      const response = await this.client.beta.chat.completions.parse({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
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
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'status' in err &&
        Number((err as Record<string, unknown>).status) === 400 &&
        err.message.includes('Provider returned error')
      ) {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You must respond with valid JSON matching this schema. Do not include explanations outside the JSON.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
          temperature: options?.temperature ?? this.defaultTemperature,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('LLM returned no content');
        }

        try {
          const parsed = JSON.parse(content) as T;
          return schema.parse(parsed);
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          throw new Error(`Failed to parse LLM JSON response: ${msg}`);
        }
      }
      throw err;
    }
  }
}
