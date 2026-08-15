import type { SQLiteDatabase } from 'expo-sqlite';

import type { Visit, VisitSyncStatus } from '../../domain/entities/Visit';
import type { VisitRepository } from '../../domain/repositories/VisitRepository';

interface VisitRow {
  id: string;
  point_id: number;
  installation_code: string;
  meter_number: string;
  previous_reading: number;
  current_reading: number;
  photo_uri: string;
  latitude: number;
  longitude: number;
  captured_at: string;
  sync_status: VisitSyncStatus;
}

function visitFromRow(row: VisitRow): Visit {
  return {
    id: row.id,
    pointId: row.point_id,
    installationCode: row.installation_code,
    meterNumber: row.meter_number,
    previousReading: row.previous_reading,
    currentReading: row.current_reading,
    photoUri: row.photo_uri,
    latitude: row.latitude,
    longitude: row.longitude,
    capturedAt: row.captured_at,
    syncStatus: row.sync_status,
  };
}

/**
 * SQLite-backed implementation of VisitRepository. Owns all SQL and row
 * mapping for the visits table; callers only see domain types through the
 * VisitRepository contract. Writes are local only and never trigger
 * network activity.
 */
export class SQLiteVisitRepository implements VisitRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async saveVisit(visit: Visit): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO visits (
         id, point_id, installation_code, meter_number, previous_reading, current_reading,
         photo_uri, latitude, longitude, captured_at, sync_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         point_id = excluded.point_id,
         installation_code = excluded.installation_code,
         meter_number = excluded.meter_number,
         previous_reading = excluded.previous_reading,
         current_reading = excluded.current_reading,
         photo_uri = excluded.photo_uri,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         captured_at = excluded.captured_at,
         sync_status = excluded.sync_status;`,
      [
        visit.id,
        visit.pointId,
        visit.installationCode,
        visit.meterNumber,
        visit.previousReading,
        visit.currentReading,
        visit.photoUri,
        visit.latitude,
        visit.longitude,
        visit.capturedAt,
        visit.syncStatus,
      ],
    );
  }

  async getVisitById(visitId: string): Promise<Visit | null> {
    const row = await this.db.getFirstAsync<VisitRow>('SELECT * FROM visits WHERE id = ?;', [visitId]);
    return row ? visitFromRow(row) : null;
  }

  async getVisitsByPointId(pointId: number): Promise<Visit[]> {
    const rows = await this.db.getAllAsync<VisitRow>(
      'SELECT * FROM visits WHERE point_id = ? ORDER BY captured_at ASC;',
      [pointId],
    );
    return rows.map(visitFromRow);
  }

  async getVisitsBySyncStatus(syncStatus: VisitSyncStatus): Promise<Visit[]> {
    const rows = await this.db.getAllAsync<VisitRow>(
      'SELECT * FROM visits WHERE sync_status = ? ORDER BY captured_at ASC;',
      [syncStatus],
    );
    return rows.map(visitFromRow);
  }

  async updateSyncStatus(visitId: string, syncStatus: VisitSyncStatus): Promise<void> {
    await this.db.runAsync('UPDATE visits SET sync_status = ? WHERE id = ?;', [syncStatus, visitId]);
  }
}
