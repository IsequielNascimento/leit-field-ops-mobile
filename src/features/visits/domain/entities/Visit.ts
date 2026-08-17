/**
 * Synchronization states a visit can be persisted in:
 * `pending -> syncing -> synced`, with `pending -> syncing -> error` when the
 * send is refused. An `error` record is retryable and re-enters `syncing`.
 */
export type VisitSyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

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
