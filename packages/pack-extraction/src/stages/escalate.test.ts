import { describe, it, expect } from 'vitest';
import { shouldEscalate } from './escalate.js';
import type { VerifyChapterResult } from './verify.js';

function result(healthy: boolean): VerifyChapterResult {
  return {
    concepts: [],
    objectives: [],
    rejections: [],
    totalItems: 0,
    healthy,
  };
}

describe('shouldEscalate', () => {
  it('escalates unhealthy chapters', () => {
    expect(shouldEscalate(result(false))).toBe(true);
  });

  it('never escalates healthy chapters', () => {
    expect(shouldEscalate(result(true))).toBe(false);
  });
});
