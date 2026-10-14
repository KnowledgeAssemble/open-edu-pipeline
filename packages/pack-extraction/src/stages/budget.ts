import { estimateCostUsd, estimateTokens } from '../config/stage-config.js';

export const DEFAULT_EXPECTED_OUTPUT_CHARS = 6000;

export interface CallEstimate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function estimateCall(
  model: string,
  prompt: string,
  expectedOutputChars = DEFAULT_EXPECTED_OUTPUT_CHARS,
): CallEstimate {
  const inputTokens = estimateTokens(prompt);
  const outputTokens = estimateTokens('x'.repeat(expectedOutputChars));
  return {
    model,
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(model, inputTokens, outputTokens),
  };
}

/**
 * Conservative budget guard over char-based estimates (pipeline-llm exposes no
 * token usage). Exceeding the cap aborts the run cleanly with partial state kept.
 */
export class BudgetGuard {
  private spent = 0;

  constructor(readonly maxUsd: number) {}

  get spentUsd(): number {
    return this.spent;
  }

  wouldExceed(estimate: CallEstimate): boolean {
    return this.spent + estimate.costUsd > this.maxUsd;
  }

  charge(estimate: CallEstimate): void {
    this.spent += estimate.costUsd;
  }
}
