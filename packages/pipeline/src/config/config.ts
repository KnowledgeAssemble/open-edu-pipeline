import type { LlmStageConfigs } from '@open-edu/pipeline-llm';
import { LLM_STAGES, DEFAULT_STAGE_CONFIGS } from '@open-edu/pipeline-llm';

export interface StageOverride {
  stage: string;
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
}

function envVarForStage(stage: string, field: string): string | undefined {
  const key = `LLM_STAGE_${stage.toUpperCase()}_${field.toUpperCase()}`;
  return process.env[key] || undefined;
}

function parseNumeric(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

export function resolveStageConfigs(overrides: StageOverride[] = []): LlmStageConfigs {
  const configs = { ...DEFAULT_STAGE_CONFIGS } as LlmStageConfigs;
  for (const stage of LLM_STAGES) {
    configs[stage] = { ...DEFAULT_STAGE_CONFIGS[stage] };
  }

  const legacyProvider = process.env.LLM_PROVIDER;
  const legacyModel = process.env.LLM_MODEL;
  const legacyMaxTokens = parseNumeric(process.env.LLM_MAX_TOKENS);
  const legacyTemperature = parseNumeric(process.env.LLM_TEMPERATURE);

  if (
    legacyProvider ||
    legacyModel ||
    legacyMaxTokens !== undefined ||
    legacyTemperature !== undefined
  ) {
    for (const stage of LLM_STAGES) {
      if (legacyProvider) configs[stage].provider = legacyProvider;
      if (legacyModel) configs[stage].model = legacyModel;
      if (legacyMaxTokens !== undefined) configs[stage].maxTokens = legacyMaxTokens;
      if (legacyTemperature !== undefined) configs[stage].temperature = legacyTemperature;
    }
  }

  for (const stage of LLM_STAGES) {
    const provider = envVarForStage(stage, 'provider');
    const model = envVarForStage(stage, 'model');
    const maxTokens = parseNumeric(envVarForStage(stage, 'max_tokens'));
    const temperature = parseNumeric(envVarForStage(stage, 'temperature'));
    if (provider !== undefined) configs[stage].provider = provider;
    if (model !== undefined) configs[stage].model = model;
    if (maxTokens !== undefined) configs[stage].maxTokens = maxTokens;
    if (temperature !== undefined) configs[stage].temperature = temperature;
  }

  for (const override of overrides) {
    for (const stage of LLM_STAGES) {
      if (override.stage !== 'all' && override.stage !== stage) continue;
      if (override.provider !== undefined) configs[stage].provider = override.provider;
      if (override.model !== undefined) configs[stage].model = override.model;
      if (override.temperature !== undefined) configs[stage].temperature = override.temperature;
      if (override.maxTokens !== undefined) configs[stage].maxTokens = override.maxTokens;
    }
  }

  for (const stage of LLM_STAGES) {
    if (!configs[stage].provider) configs[stage].provider = 'openai';
    if (!configs[stage].model) configs[stage].model = 'gpt-5.4-mini';
    if (configs[stage].maxTokens <= 0) {
      throw new Error(
        `Invalid maxTokens (${configs[stage].maxTokens}) for stage "${stage}". Must be > 0.`,
      );
    }
    if (configs[stage].temperature < 0 || configs[stage].temperature > 2) {
      throw new Error(
        `Invalid temperature (${configs[stage].temperature}) for stage "${stage}". Must be 0–2.`,
      );
    }
  }

  return configs;
}

export function parseStageOverride(raw: string): StageOverride {
  const eqIdx = raw.indexOf('=');
  if (eqIdx < 1) {
    throw new Error(
      `Invalid stage override: "${raw}". Expected format: stage=value or stage:field=value`,
    );
  }
  const key = raw.slice(0, eqIdx);
  const value = raw.slice(eqIdx + 1);
  if (!/^[a-zA-Z_][a-zA-Z0-9_:]*$/.test(key)) {
    throw new Error(`Invalid stage override key: "${key}".`);
  }

  const parts = key.split(':');
  const stage = parts[0] || '';
  const field = parts[1];

  if (!field) {
    return { stage, model: value };
  }

  switch (field) {
    case 'model':
      return { stage, model: value };
    case 'provider':
      return { stage, provider: value };
    case 'temperature': {
      const t = Number(value);
      if (isNaN(t) || t < 0 || t > 2) {
        throw new Error(`Invalid temperature "${value}" for stage "${stage}". Must be 0–2.`);
      }
      return { stage, temperature: t };
    }
    case 'max_tokens':
    case 'max-tokens':
    case 'maxTokens': {
      const n = Number(value);
      if (isNaN(n) || n <= 0 || !Number.isInteger(n)) {
        throw new Error(
          `Invalid maxTokens "${value}" for stage "${stage}". Must be a positive integer.`,
        );
      }
      return { stage, maxTokens: n };
    }
    default:
      throw new Error(
        `Unknown field "${field}" in stage override "${raw}". Expected: model, provider, temperature, max_tokens.`,
      );
  }
}

export function logStageConfigs(configs: LlmStageConfigs, log: (msg: string) => void): void {
  for (const stage of LLM_STAGES) {
    const cfg = configs[stage];
    log(
      `  ${stage}: ${cfg.provider}/${cfg.model} (t=${cfg.temperature}, maxTokens=${cfg.maxTokens})`,
    );
  }
}
