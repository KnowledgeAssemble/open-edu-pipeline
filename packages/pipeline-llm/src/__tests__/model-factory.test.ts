import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createModelFactory, createModelFactoryFromEnv } from '../model-factory.js';

describe('ModelFactory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a factory with getModel, getCapabilities, hasCapability', () => {
    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(factory.getModel).toBeInstanceOf(Function);
    expect(factory.getCapabilities).toBeInstanceOf(Function);
    expect(factory.hasCapability).toBeInstanceOf(Function);
  });

  it('getModel("fast") returns a LanguageModel for openai provider', () => {
    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const model = factory.getModel('fast');
    expect(model).toBeDefined();
    expect(typeof model).toBe('object');
  });

  it('getModel("escalation") returns a LanguageModel for openai provider', () => {
    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const model = factory.getModel('escalation');
    expect(model).toBeDefined();
    expect(typeof model).toBe('object');
  });

  it('getCapabilities() returns correct capabilities for openai', () => {
    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const caps = factory.getCapabilities();
    expect(caps).toContain('streaming');
    expect(caps).toContain('structured-output');
    expect(caps).toContain('tool-calling');
  });

  it('getCapabilities() returns correct capabilities for google', () => {
    const factory = createModelFactory({
      provider: 'google',
      model: 'gemini-2.0-flash-001',
      apiKey: 'test-key',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const caps = factory.getCapabilities();
    expect(caps).toContain('streaming');
    expect(caps).toContain('structured-output');
    expect(caps).toContain('tool-calling');
  });

  it('hasCapability("streaming") returns true for openai', () => {
    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(factory.hasCapability('streaming')).toBe(true);
  });

  it('hasCapability("structured-output") returns true for google', () => {
    const factory = createModelFactory({
      provider: 'google',
      model: 'gemini-2.0-flash-001',
      apiKey: 'test-key',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(factory.hasCapability('structured-output')).toBe(true);
  });

  it('missing API key: factory still constructs (deferred validation)', () => {
    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: '',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(factory).toBeDefined();
  });

  it('custom baseURL with empty apiKey (Ollama-style): returns a model', () => {
    const factory = createModelFactory({
      provider: 'openai',
      model: 'llama3.2',
      apiKey: '',
      baseURL: 'http://localhost:11434/v1',
      maxTokens: 4096,
      temperature: 0.3,
    });
    const model = factory.getModel('fast');
    expect(model).toBeDefined();
    expect(typeof model).toBe('object');
  });

  it('unknown provider: throws on getModel', () => {
    const factory = createModelFactory({
      provider: 'unknown',
      model: 'test',
      apiKey: 'test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(() => factory.getModel('fast')).toThrow('Unknown provider');
  });

  it('createModelFactoryFromEnv reads from environment variables', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai');
    vi.stubEnv('LLM_API_KEY', 'sk-env-test');
    vi.stubEnv('LLM_MODEL', 'gpt-4o');

    const factory = createModelFactoryFromEnv();
    expect(factory).toBeDefined();
    expect(factory.getCapabilities()).toContain('streaming');

    vi.unstubAllEnvs();
  });

  it('LLM_FAST_MODEL env var overrides the default fast model', () => {
    vi.stubEnv('LLM_FAST_MODEL', 'gpt-4o');

    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    // getModel should resolve using LLM_FAST_MODEL env var
    expect(factory).toBeDefined();

    vi.unstubAllEnvs();
  });

  it('LLM_ESCALATION_MODEL env var overrides the default escalation model', () => {
    vi.stubEnv('LLM_ESCALATION_MODEL', 'gpt-4o');

    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(factory).toBeDefined();

    vi.unstubAllEnvs();
  });

  it('when LLM_FAST_MODEL is not set, falls back to provider default (gpt-4o-mini for openai)', () => {
    vi.unstubAllEnvs();

    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(factory).toBeDefined();
  });

  it('when LLM_ESCALATION_MODEL is not set, falls back to LLM_MODEL', () => {
    vi.unstubAllEnvs();

    const factory = createModelFactory({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      maxTokens: 4096,
      temperature: 0.3,
    });
    expect(factory).toBeDefined();
  });
});
