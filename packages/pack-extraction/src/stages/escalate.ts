import type { VerifyChapterResult } from './verify.js';

/**
 * Stage 4 trigger. A chapter escalates to the escalation tier only when its
 * fast-tier extraction failed deterministic verification (Stage 3); healthy
 * chapters never spend escalation tokens. The retry itself is issued by the
 * orchestrator so it can share the budget guard, cache store, and call seam.
 */
export function shouldEscalate(verify: VerifyChapterResult): boolean {
  return !verify.healthy;
}
