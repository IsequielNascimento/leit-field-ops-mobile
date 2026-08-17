import type { Visit } from '../entities/Visit';

/**
 * Result of handing one visit to the sender. It is a union rather than
 * `void` so that a future HTTP client can report a refused submission
 * through the same contract, without changing callers.
 */
export type VisitSyncOutcome =
  | { kind: 'accepted' }
  | { kind: 'rejected'; message: string };

/**
 * The send boundary for completed visits. The application depends only on
 * this contract; the current implementation is a local simulator and can be
 * replaced by a real API client without touching the use case, the
 * view-model or the screens.
 */
export interface VisitSyncGateway {
  sendVisit(visit: Visit): Promise<VisitSyncOutcome>;
}
