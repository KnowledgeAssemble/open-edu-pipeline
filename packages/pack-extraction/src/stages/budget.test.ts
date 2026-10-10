import { describe, it, expect } from 'vitest';
import { BudgetGuard, estimateCall } from './budget.js';
import { estimateTokens, estimateCostUsd } from '../config/stage-config.js';

describe('estimateCall', () => {
  it('uses the char/4 token heuristic for input', () => {
    const call = estimateCall('gpt-4o-mini', 'a'.repeat(400));
    expect(call.inputTokens).toBe(100);
  });

  it('prices the call from the model table', () => {
    const call = estimateCall('gpt-4o-mini', 'a'.repeat(400));
    expect(call.costUsd).toBeCloseTo(
      estimateCostUsd('gpt-4o-mini', 100, estimateTokens('x'.repeat(6000))),
      10,
    );
  });

  it('honors custom expected output length', () => {
    const small = estimateCall('gpt-4o-mini', 'hi', 4);
    expect(small.outputTokens).toBe(1);
  });
});

describe('BudgetGuard', () => {
  it('tracks spend and predicts overflow', () => {
    const guard = new BudgetGuard(0.001);
    const call = estimateCall('gpt-4o', 'a'.repeat(40000));
    expect(guard.wouldExceed(call)).toBe(true);
    expect(guard.spentUsd).toBe(0);
  });

  it('charges within budget', () => {
    const guard = new BudgetGuard(1);
    const call = estimateCall('gpt-4o-mini', 'a'.repeat(400));
    expect(guard.wouldExceed(call)).toBe(false);
    guard.charge(call);
    expect(guard.spentUsd).toBeCloseTo(call.costUsd, 12);
  });

  it('accumulates charges', () => {
    const guard = new BudgetGuard(1);
    const call = estimateCall('gpt-4o-mini', 'a'.repeat(400));
    guard.charge(call);
    guard.charge(call);
    expect(guard.spentUsd).toBeCloseTo(call.costUsd * 2, 12);
  });
});
