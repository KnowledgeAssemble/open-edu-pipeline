import type { CurriculumProfile } from '../profile/types.js';
import type { LlmRouter } from '@open-edu/pipeline-llm';

export interface ProfileEvalResult {
  profileId: string;
  subject: string;
  conceptCount: number;
  sourceCoveragePercent: number;
  activityCount: number;
  assetCount: number;
  widgetValidityPercent: number;
  latencyMs: number;
  retriesUsed: number;
  llmCalls: number;
  publishStatus: 'complete' | 'partial' | 'failed';
}

export async function evaluateProfile(
  _router: LlmRouter,
  _profile: CurriculumProfile,
  _pdfPath: string,
): Promise<ProfileEvalResult> {
  // Placeholder: full implementation requires running the pipeline
  return {
    profileId: _profile.id,
    subject: _profile.subject,
    conceptCount: 0,
    sourceCoveragePercent: 0,
    activityCount: 0,
    assetCount: 0,
    widgetValidityPercent: 0,
    latencyMs: 0,
    retriesUsed: 0,
    llmCalls: 0,
    publishStatus: 'partial',
  };
}

export function compareProfiles(results: ProfileEvalResult[]): {
  bestByMetric: Record<string, string>;
  comparison: ProfileEvalResult[];
} {
  const bestByMetric: Record<string, string> = {};

  if (results.length > 0) {
    const bestConcept = [...results].sort((a, b) => b.conceptCount - a.conceptCount)[0]!;
    bestByMetric.conceptCount = bestConcept.profileId;

    const bestCoverage = [...results].sort(
      (a, b) => b.sourceCoveragePercent - a.sourceCoveragePercent,
    )[0]!;
    bestByMetric.sourceCoverage = bestCoverage.profileId;

    const bestWidget = [...results].sort(
      (a, b) => b.widgetValidityPercent - a.widgetValidityPercent,
    )[0]!;
    bestByMetric.widgetValidity = bestWidget.profileId;

    const bestLatency = [...results].sort((a, b) => a.latencyMs - b.latencyMs)[0]!;
    bestByMetric.latency = bestLatency.profileId;
  }

  return { bestByMetric, comparison: results };
}
