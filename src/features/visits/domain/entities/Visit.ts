/**
 * TASK-003 baseline synchronization states. The `error` state is owned by
 * a later synchronization task and is intentionally not part of this union.
 */
export type VisitSyncStatus = 'pending' | 'syncing' | 'synced';

/**
 * A completed visit record, persisted entirely offline. Captures the
 * reading, photo reference, location and sync status for a route point.
 */
export interface Visit {
  id: string;
  pointId: number;
  installationCode: string;
  meterNumber: string;
  previousReading: number;
  currentReading: number;
  photoUri: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
  syncStatus: VisitSyncStatus;
}
