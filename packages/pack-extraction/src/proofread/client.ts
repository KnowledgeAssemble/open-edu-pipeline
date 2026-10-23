import type { ProofreadClient, VerificationRequest, VerificationResponse } from './types.js';
import type { PageReview } from './types.js';

export type { ProofreadClient, VerificationRequest, VerificationResponse, PageReview };

export function sameReviewerAndVerifier(
  review: Pick<ProofreadClient, 'provider' | 'model'>,
  verifier: Pick<ProofreadClient, 'provider' | 'model'>,
): boolean {
  return review.provider === verifier.provider && review.model === verifier.model;
}
