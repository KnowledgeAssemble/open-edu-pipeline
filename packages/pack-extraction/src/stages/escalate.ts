import type { VerifyChapterResult } from './verify.js';
import type { CoverageReport } from './coverage.js';

/**
 * Stage 4 trigger. A chapter escalates to the escalation tier when the fast-tier
 * attempt left something on the table: a rejected item (the verifier could not
 * ground it), a stated objective that was not extracted, a teaching section with no
 * concept, or a section whose only concept attempt was rejected. Chapters that
 * extracted everything the chapter states never spend escalation tokens.
 */
export function shouldEscalate(verify: VerifyChapterResult): boolean {
  if (verify.rejections.length > 0) return true;
  if (verify.coverage.objectiveGap > 0) return true;
  if (verify.coverage.lostSections.length > 0) return true;
  if (verify.coverage.lowCoverage) return true;
  return !verify.healthy;
}

export type { CoverageReport };
