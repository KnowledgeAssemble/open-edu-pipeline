import { describe, it, expect } from 'vitest';
import { shouldEscalate } from './escalate.js';
import type { VerifyChapterResult } from './verify.js';
import type { CoverageReport } from './coverage.js';

function coverage(overrides: Partial<CoverageReport> = {}): CoverageReport {
  return {
    statedObjectives: 0,
    extractedObjectives: 0,
    objectiveGap: 0,
    teachingSections: 0,
    coveredSections: 0,
    uncoveredSections: [],
    lostSections: [],
    coverageRatio: 1,
    lowCoverage: false,
    ...overrides,
  };
}

function result(
  healthy: boolean,
  overrides: Partial<VerifyChapterResult> = {},
): VerifyChapterResult {
  return {
    concepts: [],
    objectives: [],
    rejections: [],
    totalItems: 0,
    healthy,
    coverage: coverage(),
    failures: [],
    ...overrides,
  };
}

describe('shouldEscalate', () => {
  it('escalates unhealthy chapters', () => {
    expect(shouldEscalate(result(false))).toBe(true);
  });

  it('never escalates healthy chapters', () => {
    expect(shouldEscalate(result(true))).toBe(false);
  });

  it('escalates when the fast tier lost a rejected item', () => {
    const verify = result(true, {
      rejections: [{ item: 'Expanded form', reason: 'excerpt-not-found' }],
    });
    expect(shouldEscalate(verify)).toBe(true);
  });

  it('escalates when stated objectives were not extracted', () => {
    const verify = result(true, { coverage: coverage({ objectiveGap: 2 }) });
    expect(shouldEscalate(verify)).toBe(true);
  });

  it('escalates when coverage is below the floor', () => {
    const verify = result(true, { coverage: coverage({ lowCoverage: true }) });
    expect(shouldEscalate(verify)).toBe(true);
  });

  it('does not escalate a healthy chapter with a few uncovered sections', () => {
    const verify = result(true, {
      coverage: coverage({
        teachingSections: 15,
        coveredSections: 14,
        uncoveredSections: ['1.13 Descending order'],
        coverageRatio: 14 / 15,
        lowCoverage: false,
      }),
    });
    expect(shouldEscalate(verify)).toBe(false);
  });

  it('escalates when a section lost its only concept', () => {
    const verify = result(true, { coverage: coverage({ lostSections: ['1.10 Expanded form'] }) });
    expect(shouldEscalate(verify)).toBe(true);
  });
});
