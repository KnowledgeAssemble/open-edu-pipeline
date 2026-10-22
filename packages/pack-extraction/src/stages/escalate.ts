import type { VerifyChapterResult } from './verify.js';
import type { CoverageReport } from './coverage.js';

/**
 * Stage 4 trigger. A chapter escalates to the escalation tier when the fast-tier
 * attempt left something on the table: a rejected item (the verifier could not
 * ground it), a stated objective that was not extracted, a section whose only
 * concept attempt was rejected, or coverage below the 50% teaching-section floor.
 * Individual uncovered sections are fed to the escalation prompt but do not by
 * themselves trigger it, so a nearly complete chapter does not spend an extra
 * call for one thin section.
 */
export function shouldEscalate(verify: VerifyChapterResult): boolean {
  if (verify.rejections.length > 0) return true;
  if (verify.coverage.objectiveGap > 0) return true;
  if (verify.coverage.lostSections.length > 0) return true;
  if (verify.coverage.lowCoverage) return true;
  return !verify.healthy;
}

export type { CoverageReport };
