import type {
  PageReview,
  ProofreadClient,
  VerificationRequest,
  VerificationResponse,
} from './types.js';
import { PageReviewSchema, VerificationResponseSchema } from './types.js';
import type { PageWindow } from './types.js';

export interface FakeProofreadHandlers {
  review?: (request: { prompt: string; window: PageWindow }) => PageReview | unknown;
  verify?: (request: VerificationRequest) => VerificationResponse | unknown;
}

/** Deterministic proofread double used by unit and integration tests. */
export class FakeProofreadClient implements ProofreadClient {
  readonly provider = 'fake';
  readonly model = 'fake-vision';
  readonly supportsImages = true;
  readonly reviewCalls: Array<{ prompt: string; window: PageWindow }> = [];
  readonly verifyCalls: VerificationRequest[] = [];

  constructor(private readonly handlers: FakeProofreadHandlers = {}) {}

  async review(request: { prompt: string; window: PageWindow }): Promise<PageReview> {
    this.reviewCalls.push(request);
    const raw = this.handlers.review
      ? this.handlers.review(request)
      : { pages: request.window.pageNums, pagePresence: [], issues: [] };
    return PageReviewSchema.parse(raw);
  }

  async verify(request: VerificationRequest): Promise<VerificationResponse> {
    this.verifyCalls.push(request);
    const raw = this.handlers.verify
      ? this.handlers.verify(request)
      : { decision: 'accept', reason: 'fake verifier', evidence: '' };
    return VerificationResponseSchema.parse(raw);
  }
}

/** Fails loudly if a review call is attempted; proves cache replay. */
export class FailingProofreadClient implements ProofreadClient {
  readonly provider = 'failing';
  readonly model = 'failing-model';
  readonly supportsImages = true;

  async review(): Promise<PageReview> {
    throw new Error('FailingProofreadClient: unexpected review call (expected a cache hit)');
  }

  async verify(): Promise<VerificationResponse> {
    throw new Error('FailingProofreadClient: unexpected verification call (expected a cache hit)');
  }
}
