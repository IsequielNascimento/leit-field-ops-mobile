import type { Visit, VisitSyncStatus } from '../entities/Visit';

export type VisitDisplayTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface VisitDisplayStatus {
  label: string;
  tone: VisitDisplayTone;
}

const SYNC_STATUS_LABELS: Record<VisitSyncStatus, string> = {
  pending: 'Visited · pending sync',
  syncing: 'Visited · syncing',
  synced: 'Visited · synced',
};

function toneForStatus(status: string): VisitDisplayTone {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'synced':
      return 'success';
    case 'pending':
    case 'assigned':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Picks the visit that should represent a point, newest capture first. */
export function selectLatestVisit(visits: readonly Visit[]): Visit | null {
  return visits.reduce<Visit | null>(
    (latest, visit) => (latest === null || visit.capturedAt >= latest.capturedAt ? visit : latest),
    null,
  );
}

/**
 * Describes how a point should be labelled. Once a visit has been recorded
 * locally, the visit's own state is what the field agent needs to see; until
 * then the point keeps the status delivered with the official route.
 */
export function deriveVisitDisplayStatus(
  pointStatus: string,
  latestVisit: Visit | null,
): VisitDisplayStatus {
  if (!latestVisit) {
    return { label: pointStatus, tone: toneForStatus(pointStatus) };
  }

  return {
    label: SYNC_STATUS_LABELS[latestVisit.syncStatus],
    tone: toneForStatus(latestVisit.syncStatus),
  };
}
