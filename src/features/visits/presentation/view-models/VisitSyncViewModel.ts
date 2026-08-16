import type { ConnectivityStatus } from '@/features/app-shell/domain/ConnectivityService';
import type { VisitSyncStatus } from '../../domain/entities/Visit';
import type { VisitRepository } from '../../domain/repositories/VisitRepository';
import type { VisitSyncProgressListener } from '../../domain/use-cases/SynchronizePendingVisits';
import type { VisitSyncRunner } from '../../domain/use-cases/VisitSyncRunner';

const SUMMARY_FAILURE = 'The synchronization queue could not be read from this device.';

export interface VisitSyncSummary {
  error: number;
  pending: number;
  syncing: number;
  synced: number;
}

export const EMPTY_VISIT_SYNC_SUMMARY: VisitSyncSummary = {
  error: 0,
  pending: 0,
  syncing: 0,
  synced: 0,
};

export type VisitSyncState =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'completed'; synced: number; failed: number }
  | { kind: 'failed'; message: string };

/** Counts the synchronization queue from persisted visits only. */
export async function loadVisitSyncSummary(
  repository: VisitRepository,
): Promise<VisitSyncSummary> {
  try {
    const [pending, syncing, synced, failed] = await Promise.all([
      repository.getVisitsBySyncStatus('pending'),
      repository.getVisitsBySyncStatus('syncing'),
      repository.getVisitsBySyncStatus('synced'),
      repository.getVisitsBySyncStatus('error'),
    ]);

    return {
      error: failed.length,
      pending: pending.length,
      syncing: syncing.length,
      synced: synced.length,
    };
  } catch {
    return EMPTY_VISIT_SYNC_SUMMARY;
  }
}

/** Records the manual action and the reconnect hook are allowed to retry. */
export function eligibleForSyncCount(summary: VisitSyncSummary): number {
  return summary.pending + summary.error + summary.syncing;
}

/**
 * The reconnect rule, kept pure so it is provable without rendering React:
 * only a real offline -> online transition starts an attempt, so a stream of
 * repeated `online` events cannot trigger repeated runs.
 */
export function shouldTriggerReconnectSync(
  previous: ConnectivityStatus,
  next: ConnectivityStatus,
): boolean {
  return previous === 'offline' && next === 'online';
}

/** Moves one record between queue buckets so the counts follow a run live. */
export function applyVisitSyncTransition(
  summary: VisitSyncSummary,
  previous: VisitSyncStatus,
  next: VisitSyncStatus,
): VisitSyncSummary {
  if (previous === next) {
    return summary;
  }

  const updated: VisitSyncSummary = { ...summary };
  updated[previous] = Math.max(0, updated[previous] - 1);
  updated[next] += 1;

  return updated;
}

/**
 * Runs the synchronization command through the shared single-flight runner and
 * maps it to screen state. A trigger that arrives while a run is already in
 * flight resolves to `null`, so the caller leaves the running state alone
 * instead of overwriting it with a second outcome.
 */
export async function runVisitSync(
  runner: VisitSyncRunner,
  onVisitChanged?: VisitSyncProgressListener,
): Promise<VisitSyncState | null> {
  const result = await runner.run(onVisitChanged);

  if (result.kind === 'skipped') {
    return null;
  }

  if (result.kind === 'failed') {
    return { kind: 'failed', message: result.message || SUMMARY_FAILURE };
  }

  return {
    kind: 'completed',
    synced: result.summary.synced,
    failed: result.summary.failed,
  };
}

function describeIdleQueue(summary: VisitSyncSummary): string {
  if (summary.error > 0) {
    const plural = summary.error === 1 ? '' : 's';
    const waiting = summary.pending + summary.syncing;
    const rest = waiting === 0 ? '' : ` ${waiting} more waiting to be sent.`;

    return `${summary.error} visit${plural} failed to send and can be retried.${rest}`;
  }

  const waiting = summary.pending + summary.syncing;

  return waiting === 0
    ? 'No visits are waiting to be sent.'
    : `${waiting} visit${waiting === 1 ? '' : 's'} waiting to be sent.`;
}

export function describeVisitSyncState(state: VisitSyncState, summary: VisitSyncSummary): string {
  switch (state.kind) {
    case 'idle':
      return describeIdleQueue(summary);
    case 'syncing':
      return 'Sending pending visits…';
    case 'completed':
      if (state.synced === 0 && state.failed === 0) {
        return 'No visits were waiting to be sent.';
      }

      return state.failed === 0
        ? `${state.synced} visit${state.synced === 1 ? '' : 's'} synchronized.`
        : `${state.synced} synchronized, ${state.failed} failed and kept on this device.`;
    case 'failed':
      return state.message;
  }
}
