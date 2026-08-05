import { describe, it, expect } from 'vitest';
import { generateQualityReport } from '../report.js';

describe('generateQualityReport', () => {
  const baseParams = {
    stageUsage: {},
    retries: 0,
    durationMs: 1000,
    coverage: {
      coveredRequired: 10,
      percentRequiredCovered: 100,
      percentObjectiveCovered: 100,
      percentWorkedExampleCovered: 100,
      percentExerciseCovered: 100,
      percentAssessmentCovered: 100,
      conceptCount: 5,
      activityCount: 25,
      assetCount: 3,
    },
    widgetResults: [],
    reviewItems: [],
    assetCount: 3,
    conceptCount: 5,
    hasCycles: false,
    validationIssues: [],
  };

  it('returns complete when all gates pass', () => {
    const report = generateQualityReport(baseParams);
    expect(report.status).toBe('complete');
    expect(report.publishGates.requiredCoverage.passed).toBe(true);
    expect(report.publishGates.subjectValidation.passed).toBe(true);
    expect(report.publishGates.noDependencyCycles.passed).toBe(true);
  });

  it('returns partial when coverage fails', () => {
    const report = generateQualityReport({
      ...baseParams,
      coverage: { ...baseParams.coverage, percentRequiredCovered: 50, coveredRequired: 5 },
    });
    expect(report.status).toBe('partial');
  });

  it('returns partial when validation fails', () => {
    const report = generateQualityReport({
      ...baseParams,
      validationIssues: [{ id: 'v1', severity: 'error', message: 'Wrong', source: 'math' }],
    });
    expect(report.status).toBe('partial');
  });

  it('returns failed when no concepts generated', () => {
    const report = generateQualityReport({
      ...baseParams,
      conceptCount: 0,
      coverage: {
        ...baseParams.coverage,
        percentRequiredCovered: 0,
        coveredRequired: 0,
        conceptCount: 0,
      },
    });
    expect(report.status).toBe('failed');
  });

  it('detects dependency cycles', () => {
    const report = generateQualityReport({ ...baseParams, hasCycles: true });
    expect(report.publishGates.noDependencyCycles.passed).toBe(false);
  });
});
