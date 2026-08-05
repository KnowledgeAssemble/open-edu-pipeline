export const LLM_STAGES = [
  'source_inventory',
  'concept_map',
  'concept_enrichment',
  'lesson_blueprint',
  'asset_plan',
  'activity_generation',
  'review',
] as const;

export type LlmStage = (typeof LLM_STAGES)[number];

export interface LlmStageConfig {
  provider: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export type LlmStageConfigs = Record<LlmStage, LlmStageConfig>;

export const DEFAULT_STAGE_CONFIGS: LlmStageConfigs = {
  source_inventory: {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    maxTokens: 4096,
    temperature: 0.3,
  },
  concept_map: { provider: 'openai', model: 'gpt-5.4', maxTokens: 4096, temperature: 0.3 },
  concept_enrichment: {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    maxTokens: 4096,
    temperature: 0.3,
  },
  lesson_blueprint: { provider: 'openai', model: 'gpt-5.4', maxTokens: 4096, temperature: 0.3 },
  asset_plan: { provider: 'openai', model: 'gpt-5.4-mini', maxTokens: 4096, temperature: 0.3 },
  activity_generation: {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    maxTokens: 4096,
    temperature: 0.3,
  },
  review: { provider: 'openai', model: 'gpt-5.4', maxTokens: 4096, temperature: 0.3 },
};

export function isLlmStage(value: string): value is LlmStage {
  return (LLM_STAGES as readonly string[]).includes(value);
}

export function assertLlmStage(value: string): LlmStage {
  if (!isLlmStage(value)) {
    throw new Error(`Unknown LLM stage: "${value}". Valid stages: ${LLM_STAGES.join(', ')}`);
  }
  return value as LlmStage;
}
