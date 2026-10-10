import { LlmRouter } from '@open-edu/pipeline-llm';
import type { LlmClient, LlmRequest, LlmResponse } from './client.js';

export interface PipelineLlmClientOptions {
  provider: string;
  fastModel: string;
  escalationModel: string;
}

/**
 * Adapter over `@open-edu/pipeline-llm`'s `LlmRouter`. The plan's logical stages
 * alias onto pipeline-llm's closed stage enum, and the provider/model are pushed
 * onto the router via `updateStageConfig` before every call so the fast default
 * actually holds.
 */
export class PipelineLlmClient implements LlmClient {
  private readonly router: LlmRouter;

  constructor(private readonly options: PipelineLlmClientOptions) {
    this.router = new LlmRouter();
  }

  async generateStructured<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    const model = request.tier === 'fast' ? this.options.fastModel : this.options.escalationModel;
    const temperature = request.temperature ?? 0;

    this.router.updateStageConfig(request.stage, {
      provider: this.options.provider,
      model,
      temperature,
    });

    const result = await this.router.generateStructured(
      request.stage,
      request.prompt,
      request.schema,
      {
        temperature,
      },
    );

    return { data: result.data, model: result.model, provider: result.provider };
  }
}
