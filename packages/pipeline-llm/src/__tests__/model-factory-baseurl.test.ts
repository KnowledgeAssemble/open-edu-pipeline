import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const createOpenAI = vi.fn();
  const chat = vi.fn((id: string) => ({ id, api: 'chat' as const }));
  const responses = vi.fn((id: string) => ({ id, api: 'responses' as const }));
  return { createOpenAI, chat, responses };
});

vi.mock('@ai-sdk/openai', () => {
  const provider = vi.fn((id: string) => mocks.responses(id)) as unknown as {
    (id: string): { id: string; api: 'responses' };
    chat: (id: string) => { id: string; api: 'chat' };
  };
  provider.chat = (id: string) => mocks.chat(id);
  return { createOpenAI: mocks.createOpenAI.mockImplementation(() => provider) };
});

import { createModelFactory } from '../model-factory.js';

describe('ModelFactory baseURL support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes baseURL to createOpenAI when provided', () => {
    const factory = createModelFactory({
      provider: 'openai',
      model: 'llama3.2',
      apiKey: '',
      baseURL: 'http://localhost:11434/v1',
      maxTokens: 4096,
      temperature: 0.3,
    });
    factory.getModel('fast');
    expect(mocks.createOpenAI).toHaveBeenCalledWith({
      apiKey: '',
      baseURL: 'http://localhost:11434/v1',
    });
  });

  it('uses the chat completions API when baseURL is set', () => {
    vi.stubEnv('LLM_FAST_MODEL', 'llama3.2');
    const factory = createModelFactory({
      provider: 'openai',
      model: 'llama3.2',
      apiKey: '',
      baseURL: 'http://localhost:11434/v1',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const model = factory.getModel('fast');
    expect(model).toMatchObject({ id: 'llama3.2', api: 'chat' });
    vi.unstubAllEnvs();
  });

  it('keeps the default responses API when baseURL is not set', () => {
    vi.stubEnv('LLM_FAST_MODEL', 'gpt-4o');
    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const model = factory.getModel('fast');
    expect(model).toMatchObject({ id: 'gpt-4o', api: 'responses' });
    vi.unstubAllEnvs();
  });

  it('uses config.model for the fast tier when a custom baseURL is set', () => {
    vi.stubEnv('LLM_FAST_MODEL', '');
    const factory = createModelFactory({
      provider: 'openai',
      model: 'phi3.5',
      apiKey: '',
      baseURL: 'http://localhost:11434/v1',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const model = factory.getModel('fast');
    expect(model).toMatchObject({ id: 'phi3.5', api: 'chat' });
    vi.unstubAllEnvs();
  });
});
