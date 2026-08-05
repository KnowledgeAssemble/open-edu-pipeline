import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveStageConfigs, parseStageOverride } from '../config.js';
import { LLM_STAGES } from '@open-edu/pipeline-llm';

let envBackup: Record<string, string | undefined> = {};

describe('resolveStageConfigs', () => {
  beforeEach(() => {
    envBackup = { ...process.env };
    for (const stage of LLM_STAGES) {
      delete process.env[`LLM_STAGE_${stage.toUpperCase()}_MODEL`];
      delete process.env[`LLM_STAGE_${stage.toUpperCase()}_PROVIDER`];
      delete process.env[`LLM_STAGE_${stage.toUpperCase()}_MAX_TOKENS`];
      delete process.env[`LLM_STAGE_${stage.toUpperCase()}_TEMPERATURE`];
    }
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_MAX_TOKENS;
    delete process.env.LLM_TEMPERATURE;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns default configs with no env vars', () => {
    const configs = resolveStageConfigs();
    expect(configs.source_inventory.model).toBe('gpt-5.4-mini');
    expect(configs.concept_map.model).toBe('gpt-5.4');
    expect(configs.review.model).toBe('gpt-5.4');
  });

  it('legacy LLM_MODEL sets all stages', () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    const configs = resolveStageConfigs();
    for (const stage of LLM_STAGES) {
      expect(configs[stage].model).toBe('gpt-4o-mini');
    }
  });

  it('legacy LLM_PROVIDER sets all stages', () => {
    process.env.LLM_PROVIDER = 'openrouter';
    const configs = resolveStageConfigs();
    for (const stage of LLM_STAGES) {
      expect(configs[stage].provider).toBe('openrouter');
    }
  });

  it('legacy LLM_MAX_TOKENS and LLM_TEMPERATURE set all stages', () => {
    process.env.LLM_MAX_TOKENS = '8192';
    process.env.LLM_TEMPERATURE = '0.7';
    const configs = resolveStageConfigs();
    for (const stage of LLM_STAGES) {
      expect(configs[stage].maxTokens).toBe(8192);
      expect(configs[stage].temperature).toBe(0.7);
    }
  });

  it('stage env var overrides legacy', () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    process.env.LLM_STAGE_CONCEPT_MAP_MODEL = 'gpt-5.4';
    const configs = resolveStageConfigs();
    expect(configs.concept_map.model).toBe('gpt-5.4');
    expect(configs.source_inventory.model).toBe('gpt-4o-mini');
  });

  it('CLI override takes highest precedence', () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    process.env.LLM_STAGE_CONCEPT_MAP_MODEL = 'gpt-5.4';
    const configs = resolveStageConfigs([{ stage: 'concept_map', model: 'gpt-5.4-super' }]);
    expect(configs.concept_map.model).toBe('gpt-5.4-super');
  });

  it('CLI "all" applies to every stage', () => {
    const configs = resolveStageConfigs([{ stage: 'all', model: 'gpt-5.4' }]);
    for (const stage of LLM_STAGES) {
      expect(configs[stage].model).toBe('gpt-5.4');
    }
  });

  it('rejects invalid maxTokens (zero)', () => {
    expect(() => resolveStageConfigs([{ stage: 'all', maxTokens: 0 }])).toThrow(
      'Invalid maxTokens',
    );
  });

  it('rejects invalid temperature', () => {
    expect(() => resolveStageConfigs([{ stage: 'all', temperature: 3 }])).toThrow(
      'Invalid temperature',
    );
  });
});

describe('parseStageOverride', () => {
  it('parses stage=model', () => {
    const result = parseStageOverride('source_inventory=gpt-5.4-mini');
    expect(result.stage).toBe('source_inventory');
    expect(result.model).toBe('gpt-5.4-mini');
  });

  it('parses stage:provider=value', () => {
    const result = parseStageOverride('concept_map:provider=openrouter');
    expect(result.stage).toBe('concept_map');
    expect(result.provider).toBe('openrouter');
  });

  it('parses stage:temperature=value', () => {
    const result = parseStageOverride('review:temperature=0.5');
    expect(result.stage).toBe('review');
    expect(result.temperature).toBe(0.5);
  });

  it('parses stage:max_tokens=value', () => {
    const result = parseStageOverride('review:max_tokens=8192');
    expect(result.stage).toBe('review');
    expect(result.maxTokens).toBe(8192);
  });

  it('rejects empty assignment', () => {
    expect(() => parseStageOverride('=value')).toThrow('Invalid stage override');
  });

  it('rejects unknown field', () => {
    expect(() => parseStageOverride('source_inventory:foo=bar')).toThrow('Unknown field');
  });

  it('rejects non-numeric temperature', () => {
    expect(() => parseStageOverride('source_inventory:temperature=hot')).toThrow(
      'Invalid temperature',
    );
  });

  it('rejects non-integer maxTokens', () => {
    expect(() => parseStageOverride('source_inventory:max_tokens=4.5')).toThrow(
      'Invalid maxTokens',
    );
  });
});
