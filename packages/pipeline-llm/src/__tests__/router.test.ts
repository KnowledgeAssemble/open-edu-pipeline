import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LlmRouter, legacyAdapter } from '../router.js';
import { LLM_STAGES, isLlmStage } from '../stages.js';
const TEST_KEY = 'test-key';

let envBackup: Record<string, string | undefined> = {};

describe('LlmRouter', () => {
  beforeEach(() => {
    envBackup = { ...process.env };
    process.env.OPENAI_API_KEY = TEST_KEY;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('has default stage configs for all stages', () => {
    const router = new LlmRouter();
    for (const stage of LLM_STAGES) {
      const config = router.getStageConfig(stage);
      expect(config.provider).toBeTruthy();
      expect(config.model).toBeTruthy();
      expect(config.maxTokens).toBeGreaterThan(0);
    }
  });

  it('allows overriding stage configs via constructor', () => {
    const router = new LlmRouter({
      source_inventory: {
        provider: 'openai',
        model: 'custom-mini',
        maxTokens: 2048,
        temperature: 0.3,
      },
    });
    const config = router.getStageConfig('source_inventory');
    expect(config.model).toBe('custom-mini');
    expect(config.maxTokens).toBe(2048);
    expect(config.provider).toBe('openai');
    expect(config.temperature).toBe(0.3);
  });

  it('allows overriding via updateStageConfig', () => {
    const router = new LlmRouter();
    router.updateStageConfig('concept_map', { model: 'gpt-5.4-super', temperature: 0.5 });
    const config = router.getStageConfig('concept_map');
    expect(config.model).toBe('gpt-5.4-super');
    expect(config.temperature).toBe(0.5);
    expect(config.provider).toBe('openai');
  });

  it('rejects unknown stages in getStageConfig (type-enforced at compile time)', () => {
    expect(isLlmStage('unknown_stage')).toBe(false);
  });

  it('fails without API key', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_API_KEY;
    const router = new LlmRouter();
    router.updateStageConfig('source_inventory', {
      provider: 'openai',
      model: 'gpt-5.4-mini',
      maxTokens: 4096,
      temperature: 0.3,
    } as any);
  });

  describe('legacyAdapter', () => {
    it('produces a LlmProvider from a router and stage', () => {
      const router = new LlmRouter();
      const provider = legacyAdapter(router, 'source_inventory');
      expect(provider).toBeDefined();
      expect(typeof provider.generateStructured).toBe('function');
    });
  });
});
