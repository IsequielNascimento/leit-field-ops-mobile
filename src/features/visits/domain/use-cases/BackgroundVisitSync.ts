import type { VisitSyncRunResult } from './VisitSyncRunner';

export type BackgroundVisitSyncOutcome = 'success' | 'failed';

/**
 * Maps a synchronization run to what the operating system is told.
 *
 * A run the app skipped because one was already in flight is reported as
 * success: nothing went wrong, the work is simply already being done. Only a
 * local read/write failure is reported as failed, so the scheduler does not
 * throttle the task because individual records were refused by the gateway —
 * those settle in `error` and stay eligible for the next attempt.
 */
export function describeBackgroundSyncOutcome(
  result: VisitSyncRunResult,
): BackgroundVisitSyncOutcome {
  return result.kind === 'failed' ? 'failed' : 'success';
}
