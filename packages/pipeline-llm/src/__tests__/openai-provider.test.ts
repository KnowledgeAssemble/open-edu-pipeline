import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../providers/openai-provider.js';

describe('OpenAIProvider', () => {
  it('requires an apiKey when no baseURL is configured', () => {
    expect(
      () =>
        new OpenAIProvider({
          provider: 'openai',
          model: 'gpt-4o-mini',
          apiKey: '',
          maxTokens: 4096,
          temperature: 0.3,
        }),
    ).toThrow(/API key is required/);
  });

  it('constructs with empty apiKey when a custom baseURL is set', () => {
    const provider = new OpenAIProvider({
      provider: 'openai',
      model: 'llama3.2',
      apiKey: '',
      baseURL: 'http://localhost:11434/v1',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it('points the client at the configured baseURL', () => {
    const provider = new OpenAIProvider({
      provider: 'openai',
      model: 'llama3.2',
      apiKey: 'ollama',
      baseURL: 'http://localhost:11434/v1',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const client = provider as unknown as { client: { baseURL: string } };
    expect(client.client.baseURL).toBe('http://localhost:11434/v1');
  });
});
