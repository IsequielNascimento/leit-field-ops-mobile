import type { Visit, VisitSyncStatus } from '../entities/Visit';
import type { VisitRepository } from '../repositories/VisitRepository';
import type { VisitSyncGateway } from '../services/VisitSyncService';

const QUEUE_READ_FAILURE = 'The pending visits could not be read from this device.';
const SEND_FAILURE = 'The visit could not be sent.';
const STATUS_WRITE_FAILURE = 'The synchronization status could not be saved on this device.';

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface SynchronizePendingVisitsSummary {
  attempted: number;
  synced: number;
  failed: number;
}

export type SynchronizePendingVisitsResult =
  | { kind: 'finished'; summary: SynchronizePendingVisitsSummary }
  | { kind: 'failed'; message: string };

export type VisitSyncProgressListener = (visit: Visit, previousStatus: VisitSyncStatus) => void;

/**
 * States a record can be picked up from.
 *
 * `syncing` is included because a record can only still hold that state at
 * queue-read time if the process that owned it was killed mid-flight; a live
 * run is prevented by the single-flight guard in `VisitSyncRunner`. Reading it
 * back here recovers those records instead of stranding them forever.
 */
export const SYNCHRONIZABLE_SYNC_STATUSES: readonly VisitSyncStatus[] = ['pending', 'error', 'syncing'];

async function readSyncQueue(repository: VisitRepository): Promise<Visit[]> {
  const buckets = await Promise.all(
    SYNCHRONIZABLE_SYNC_STATUSES.map((status) => repository.getVisitsBySyncStatus(status)),
  );
  const queue = new Map<string, Visit>();

  for (const bucket of buckets) {
    for (const visit of bucket) {
      queue.set(visit.id, visit);
    }
  }

  return [...queue.values()].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
}

async function transition(
  repository: VisitRepository,
  visit: Visit,
  syncStatus: VisitSyncStatus,
  onVisitChanged?: VisitSyncProgressListener,
): Promise<Visit> {
  await repository.updateSyncStatus(visit.id, syncStatus);
  const moved: Visit = { ...visit, syncStatus };
  onVisitChanged?.(moved, visit.syncStatus);

  return moved;
}

/**
 * Drives the synchronization state machine for every visit still waiting to
 * be sent — records never attempted (`pending`), records a previous attempt
 * failed on (`error`), and records a killed process left in `syncing`.
 *
 * Each record is moved `pending|error -> syncing -> synced` one at a time and
 * every transition is written to local storage before the next step, so the
 * status shown after a restart is the status that was actually reached. A
 * record the gateway does not accept settles in `error`, which is persisted
 * and remains eligible for a later retry. Only `sync_status` is ever written,
 * so a failure never touches the reading, photo reference, coordinates or
 * capture timestamp of the record.
 *
 * A local write that fails at any point ends the run as `failed` rather than
 * rejecting, so the caller can always leave its in-progress state.
 */
export async function synchronizePendingVisits(
  repository: VisitRepository,
  gateway: VisitSyncGateway,
  onVisitChanged?: VisitSyncProgressListener,
): Promise<SynchronizePendingVisitsResult> {
  let queue: Visit[];

  try {
    queue = await readSyncQueue(repository);
  } catch (error) {
    return { kind: 'failed', message: failureMessage(error, QUEUE_READ_FAILURE) };
  }

  const summary: SynchronizePendingVisitsSummary = {
    attempted: queue.length,
    synced: 0,
    failed: 0,
  };

  for (const queuedVisit of queue) {
    let syncingVisit: Visit;

    try {
      syncingVisit = await transition(repository, queuedVisit, 'syncing', onVisitChanged);
    } catch (error) {
      return { kind: 'failed', message: failureMessage(error, STATUS_WRITE_FAILURE) };
    }

    let outcome;

    try {
      outcome = await gateway.sendVisit(syncingVisit);
    } catch (error) {
      outcome = { kind: 'rejected' as const, message: failureMessage(error, SEND_FAILURE) };
    }

    const settledStatus: VisitSyncStatus = outcome.kind === 'accepted' ? 'synced' : 'error';

    try {
      await transition(repository, syncingVisit, settledStatus, onVisitChanged);
    } catch (error) {
      return { kind: 'failed', message: failureMessage(error, STATUS_WRITE_FAILURE) };
    }

    if (outcome.kind === 'accepted') {
      summary.synced += 1;
    } else {
      summary.failed += 1;
    }
  }

  return { kind: 'finished', summary };
}
