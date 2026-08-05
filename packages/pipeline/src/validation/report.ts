import type { CoverageLedger } from '../coverage/types.js';
import type { WidgetValidationResult } from './widgets.js';
import type { ValidationIssue } from './registry.js';

export interface QualityReport {
  version: 1;
  generatedAt: string;
  status: 'complete' | 'partial' | 'failed';
  stageModelUsage: Record<string, { provider: string; model: string }>;
  retries: number;
  durationMs: number;
  conceptCount: number;
  assetCount: number;
  hasCycles: boolean;
  coverage: CoverageLedger['summary'];
  validationResults: Record<
    string,
    {
      totalChecked: number;
      passed: number;
      failed: number;
      failures: ValidationIssue[];
    }
  >;
  widgetValidation: {
    totalChecked: number;
    passed: number;
    failed: number;
    failures: WidgetValidationResult[];
  };
  reviewItems: string[];
  publishGates: {
    requiredCoverage: { passed: boolean; threshold: number; actual: number };
    subjectValidation: { passed: boolean; actual: number };
    widgetValidity: { passed: boolean; actual: number };
    assetCompleteness: { passed: boolean; actual: number };
    conceptCoverage: { passed: boolean; actual: number };
    noDependencyCycles: { passed: boolean };
  };
}

export function getPublishStatus(report: QualityReport): 'complete' | 'partial' | 'failed' {
  const gates = report.publishGates;
  const allPassed =
    gates.requiredCoverage.passed &&
    gates.subjectValidation.passed &&
    gates.widgetValidity.passed &&
    gates.assetCompleteness.passed &&
    gates.conceptCoverage.passed &&
    gates.noDependencyCycles.passed;

  if (allPassed) return 'complete';
  if (gates.conceptCoverage.passed) return 'partial';
  return 'failed';
}

export function generateQualityReport(params: {
  stageUsage: Record<string, { provider: string; model: string }>;
  retries: number;
  durationMs: number;
  coverage: CoverageLedger['summary'];
  widgetResults: WidgetValidationResult[];
  reviewItems: string[];
  assetCount: number;
  conceptCount: number;
  hasCycles: boolean;
  validationIssues?: ValidationIssue[];
}): QualityReport {
  const validationResults: Record<
    string,
    { totalChecked: number; passed: number; failed: number; failures: ValidationIssue[] }
  > = {};
  if (params.validationIssues) {
    const grouped = new Map<string, ValidationIssue[]>();
    for (const issue of params.validationIssues) {
      const arr = grouped.get(issue.source) || [];
      arr.push(issue);
      grouped.set(issue.source, arr);
    }
    for (const [source, issues] of grouped) {
      const failed = issues.filter((i) => i.severity === 'error');
      validationResults[source] = {
        totalChecked: issues.length,
        passed: issues.filter((i) => i.severity === 'warning').length,
        failed: failed.length,
        failures: failed,
      };
    }
  }

  const report: QualityReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    status: 'partial',
    stageModelUsage: params.stageUsage,
    retries: params.retries,
    durationMs: params.durationMs,
    conceptCount: params.conceptCount,
    assetCount: params.assetCount,
    hasCycles: params.hasCycles,
    coverage: params.coverage,
    validationResults,
    widgetValidation: {
      totalChecked: params.widgetResults.length,
      passed: params.widgetResults.filter((r) => r.valid).length,
      failed: params.widgetResults.filter((r) => !r.valid).length,
      failures: params.widgetResults.filter((r) => !r.valid),
    },
    reviewItems: params.reviewItems,
    publishGates: {
      requiredCoverage: {
        passed: params.coverage.percentRequiredCovered >= 100,
        threshold: 100,
        actual: params.coverage.percentRequiredCovered,
      },
      subjectValidation: {
        passed:
          !params.validationIssues || params.validationIssues.every((i) => i.severity !== 'error'),
        actual: params.validationIssues
          ? params.validationIssues.filter((i) => i.severity === 'warning').length
          : 0,
      },
      widgetValidity: {
        passed: params.widgetResults.every((r) => r.valid),
        actual: params.widgetResults.filter((r) => r.valid).length,
      },
      assetCompleteness: { passed: params.assetCount > 0, actual: params.assetCount },
      conceptCoverage: { passed: params.conceptCount > 0, actual: params.conceptCount },
      noDependencyCycles: { passed: !params.hasCycles },
    },
  };

  report.status = getPublishStatus(report);
  return report;
}
