import { describe, it, expect } from 'vitest';
import { loadConfig } from './types.js';

describe('loadConfig', () => {
  it('returns default values when no env vars set', () => {
    const config = loadConfig();
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.maxTokens).toBe(4096);
    expect(config.temperature).toBe(0.3);
  });

  it('reads OPENAI_API_KEY when set', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const config = loadConfig();
    expect(config.apiKey).toBe('test-key');
    delete process.env.OPENAI_API_KEY;
  });

  it('baseURL is undefined when LLM_BASE_URL is not set', () => {
    delete process.env.LLM_BASE_URL;
    const config = loadConfig();
    expect(config.baseURL).toBeUndefined();
  });

  it('reads LLM_BASE_URL when set', () => {
    process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
    const config = loadConfig();
    expect(config.baseURL).toBe('http://localhost:11434/v1');
    delete process.env.LLM_BASE_URL;
  });
});
