import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Current supported schema version. Bump this and add a new migration step
 * when the schema changes; never lower it or skip a version.
 */
export const SCHEMA_VERSION = 2;

const MIGRATION_1_SQL = `
CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_points (
  id INTEGER PRIMARY KEY NOT NULL,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  visit_order INTEGER NOT NULL,
  installation_code TEXT NOT NULL,
  customer TEXT NOT NULL,
  reference_point TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  meter_number TEXT NOT NULL,
  previous_reading REAL NOT NULL,
  status TEXT NOT NULL,
  UNIQUE (route_id, visit_order)
);

CREATE INDEX IF NOT EXISTS idx_route_points_route_id ON route_points(route_id);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY NOT NULL,
  point_id INTEGER NOT NULL REFERENCES route_points(id) ON DELETE CASCADE,
  installation_code TEXT NOT NULL,
  meter_number TEXT NOT NULL,
  previous_reading REAL NOT NULL,
  current_reading REAL NOT NULL,
  photo_uri TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  captured_at TEXT NOT NULL,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'syncing', 'synced')) DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_visits_point_id ON visits(point_id);
CREATE INDEX IF NOT EXISTS idx_visits_sync_status ON visits(sync_status);
`;

// MARK: SQLite cannot widen a CHECK constraint in place, so `visits` is rebuilt
// and every existing row is copied column by column before the old table goes.
const MIGRATION_2_SQL = `
CREATE TABLE IF NOT EXISTS visits_with_error_status (
  id TEXT PRIMARY KEY NOT NULL,
  point_id INTEGER NOT NULL REFERENCES route_points(id) ON DELETE CASCADE,
  installation_code TEXT NOT NULL,
  meter_number TEXT NOT NULL,
  previous_reading REAL NOT NULL,
  current_reading REAL NOT NULL,
  photo_uri TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  captured_at TEXT NOT NULL,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')) DEFAULT 'pending'
);

INSERT INTO visits_with_error_status (
  id, point_id, installation_code, meter_number, previous_reading, current_reading,
  photo_uri, latitude, longitude, captured_at, sync_status
)
SELECT
  id, point_id, installation_code, meter_number, previous_reading, current_reading,
  photo_uri, latitude, longitude, captured_at, sync_status
FROM visits;

DROP TABLE visits;

ALTER TABLE visits_with_error_status RENAME TO visits;

CREATE INDEX IF NOT EXISTS idx_visits_point_id ON visits(point_id);
CREATE INDEX IF NOT EXISTS idx_visits_sync_status ON visits(sync_status);
`;

interface Migration {
  sql: string;
  version: number;
}

const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: MIGRATION_1_SQL },
  { version: 2, sql: MIGRATION_2_SQL },
];

/**
 * Runs ordered, non-destructive migrations up to SCHEMA_VERSION.
 *
 * A step is only considered applied once `PRAGMA user_version` is advanced
 * inside the same transaction as its schema changes, so a failure never
 * leaves the database on a version it did not actually reach, and a database
 * already at a given version never replays that step.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than the version ${SCHEMA_VERSION} supported by this app build.`,
    );
  }

  for (const migration of MIGRATIONS) {
    if (currentVersion >= migration.version) {
      continue;
    }

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
  }
}
