import { describe, it, expect } from 'vitest';
import { compareProfiles, type ProfileEvalResult } from '../profile-evaluation.js';

describe('profile evaluation', () => {
  it('compareProfiles returns valid comparison', () => {
    const results: ProfileEvalResult[] = [
      {
        profileId: 'math',
        subject: 'mathematics',
        conceptCount: 10,
        sourceCoveragePercent: 95,
        activityCount: 20,
        assetCount: 5,
        widgetValidityPercent: 100,
        latencyMs: 5000,
        retriesUsed: 0,
        llmCalls: 15,
        publishStatus: 'complete',
      },
      {
        profileId: 'science',
        subject: 'science',
        conceptCount: 8,
        sourceCoveragePercent: 90,
        activityCount: 16,
        assetCount: 2,
        widgetValidityPercent: 100,
        latencyMs: 4000,
        retriesUsed: 0,
        llmCalls: 12,
        publishStatus: 'complete',
      },
    ];

    const result = compareProfiles(results);
    expect(result.bestByMetric.conceptCount).toBe('math');
    expect(result.bestByMetric.latency).toBe('science');
    expect(result.comparison).toHaveLength(2);
  });
});
