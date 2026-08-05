import { describe, it, expect } from 'vitest';
import { createLlmProvider } from '../index.js';

describe('createLlmProvider', () => {
  it('creates an OpenAI provider for openai config', () => {
    const provider = createLlmProvider({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(provider.constructor.name).toBe('OpenAIProvider');
  });

  it('creates an OpenRouter provider for openrouter config', () => {
    const provider = createLlmProvider({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      apiKey: 'test-key',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(provider.constructor.name).toBe('OpenRouterProvider');
  });

  it('throws for unknown provider', () => {
    expect(() =>
      createLlmProvider({
        provider: 'anthropic',
        model: 'claude-3',
        apiKey: 'test-key',
        maxTokens: 4096,
        temperature: 0.3,
      }),
    ).toThrow('Unknown LLM provider');
  });
});
