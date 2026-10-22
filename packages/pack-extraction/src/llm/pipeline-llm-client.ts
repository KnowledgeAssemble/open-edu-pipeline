import { LlmRouter } from '@open-edu/pipeline-llm';
import type { LlmStage } from '@open-edu/pipeline-llm';
import type { LlmClient, LlmRequest, LlmResponse } from './client.js';

export interface PipelineLlmClientOptions {
  provider: string;
  fastModel: string;
  escalationModel: string;
}

interface AppliedConfig {
  provider: string;
  model: string;
  temperature: number;
}

/**
 * Adapter over `@open-edu/pipeline-llm`'s `LlmRouter`. The plan's logical stages
 * alias onto pipeline-llm's closed stage enum, and the provider/model are pushed
 * onto the router via `updateStageConfig` before a call so the tier default holds.
 * Configs are memoized per stage because `updateStageConfig` clears the router's
 * provider cache; skipping redundant updates preserves provider reuse.
 */
export class PipelineLlmClient implements LlmClient {
  private readonly router: LlmRouter;
  private readonly applied = new Map<LlmStage, AppliedConfig>();

  constructor(private readonly options: PipelineLlmClientOptions) {
    this.router = new LlmRouter();
  }

  async generateStructured<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    const model = request.tier === 'fast' ? this.options.fastModel : this.options.escalationModel;
    const temperature = request.temperature ?? 0;
    const config: AppliedConfig = { provider: this.options.provider, model, temperature };
    const previous = this.applied.get(request.stage);
    if (
      !previous ||
      previous.provider !== config.provider ||
      previous.model !== config.model ||
      previous.temperature !== config.temperature
    ) {
      this.router.updateStageConfig(request.stage, config);
      this.applied.set(request.stage, config);
    }

    const result = await this.router.generateStructured(
      request.stage,
      request.prompt,
      request.schema,
      {
        temperature,
        ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
      },
    );

    return { data: result.data, model: result.model, provider: result.provider };
  }
}
