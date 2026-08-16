import type { VisitSyncStatus } from '../../domain/entities/Visit';
import type { VisitRepository } from '../../domain/repositories/VisitRepository';
import type { VisitSyncGateway } from '../../domain/services/VisitSyncService';
import {
  synchronizePendingVisits,
  type VisitSyncProgressListener,
} from '../../domain/use-cases/SynchronizePendingVisits';

const SUMMARY_FAILURE = 'The synchronization queue could not be read from this device.';

export interface VisitSyncSummary {
  pending: number;
  syncing: number;
  synced: number;
}

export const EMPTY_VISIT_SYNC_SUMMARY: VisitSyncSummary = { pending: 0, syncing: 0, synced: 0 };

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
    const [pending, syncing, synced] = await Promise.all([
      repository.getVisitsBySyncStatus('pending'),
      repository.getVisitsBySyncStatus('syncing'),
      repository.getVisitsBySyncStatus('synced'),
    ]);

    return { pending: pending.length, syncing: syncing.length, synced: synced.length };
  } catch {
    return EMPTY_VISIT_SYNC_SUMMARY;
  }
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

/** Runs the manual synchronization command and maps it to screen state. */
export async function runManualSync(
  repository: VisitRepository,
  gateway: VisitSyncGateway,
  onVisitChanged?: VisitSyncProgressListener,
): Promise<VisitSyncState> {
  const result = await synchronizePendingVisits(repository, gateway, onVisitChanged);

  if (result.kind === 'failed') {
    return { kind: 'failed', message: result.message || SUMMARY_FAILURE };
  }

  return {
    kind: 'completed',
    synced: result.summary.synced,
    failed: result.summary.failed,
  };
}

export function describeVisitSyncState(state: VisitSyncState, summary: VisitSyncSummary): string {
  switch (state.kind) {
    case 'idle':
      return summary.pending === 0
        ? 'No visits are waiting to be sent.'
        : `${summary.pending} visit${summary.pending === 1 ? '' : 's'} waiting to be sent.`;
    case 'syncing':
      return 'Sending pending visits…';
    case 'completed':
      if (state.synced === 0 && state.failed === 0) {
        return 'No visits were waiting to be sent.';
      }

      return state.failed === 0
        ? `${state.synced} visit${state.synced === 1 ? '' : 's'} synchronized.`
        : `${state.synced} synchronized, ${state.failed} still pending.`;
    case 'failed':
      return state.message;
  }
}
