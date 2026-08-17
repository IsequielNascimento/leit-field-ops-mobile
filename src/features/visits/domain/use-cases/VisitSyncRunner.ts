import type { VisitRepository } from '../repositories/VisitRepository';
import type { VisitSyncGateway } from '../services/VisitSyncService';
import {
  synchronizePendingVisits,
  type SynchronizePendingVisitsResult,
  type VisitSyncProgressListener,
} from './SynchronizePendingVisits';

export type VisitSyncRunResult =
  | SynchronizePendingVisitsResult
  | { kind: 'skipped'; reason: 'already-running' };

/**
 * Single-flight owner of the synchronization use case.
 *
 * Both triggers in the app — the manual action and the reconnect hook — go
 * through one instance of this runner, so a second trigger arriving while a
 * run is in flight is answered with `skipped` instead of starting a parallel
 * pass over the same records. The in-flight promise is always cleared, even
 * when the run throws, so a failure cannot wedge the guard permanently shut.
 */
export class VisitSyncRunner {
  private inFlight: Promise<SynchronizePendingVisitsResult> | null = null;

  constructor(
    private readonly repository: VisitRepository,
    private readonly gateway: VisitSyncGateway,
  ) {}

  isRunning(): boolean {
    return this.inFlight !== null;
  }

  async run(onVisitChanged?: VisitSyncProgressListener): Promise<VisitSyncRunResult> {
    if (this.inFlight !== null) {
      return { kind: 'skipped', reason: 'already-running' };
    }

    const run = synchronizePendingVisits(this.repository, this.gateway, onVisitChanged);
    this.inFlight = run;

    try {
      return await run;
    } finally {
      this.inFlight = null;
    }
  }
}
