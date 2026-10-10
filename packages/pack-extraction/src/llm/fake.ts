import type { LlmClient, LlmRequest, LlmResponse } from './client.js';

export type FakeHandler = (request: LlmRequest<never>) => unknown;

/** Deterministic test double: records every call and replies from a handler. */
export class FakeLlmClient implements LlmClient {
  readonly calls: LlmRequest<never>[] = [];

  constructor(private readonly handler: FakeHandler) {}

  async generateStructured<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    this.calls.push(request as LlmRequest<never>);
    const raw = this.handler(request as unknown as LlmRequest<never>);
    const data = request.schema.parse(raw);
    return { data, model: 'fake-fast-model', provider: 'fake' };
  }
}

/** Test double that fails loudly if a call is attempted (proves cache replay). */
export class FailingLlmClient implements LlmClient {
  async generateStructured<T>(): Promise<LlmResponse<T>> {
    throw new Error('FailingLlmClient: unexpected LLM call (expected a cache hit)');
  }
}
