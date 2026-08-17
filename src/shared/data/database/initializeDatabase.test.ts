import assert from 'node:assert/strict';
import test from 'node:test';

import { OFFICIAL_ROUTE_POINT_COUNT } from '@/features/routes/data/seed/officialRouteSource';
import { initializeDatabase } from './initializeDatabase';
import { SCHEMA_VERSION } from './migrations';
import { createInMemoryTestDatabase } from './testing/inMemoryTestDatabase';

test('initialization migrates and seeds a fresh database', async () => {
  const { close, db } = createInMemoryTestDatabase();

  try {
    await initializeDatabase(db);

    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
    const points = await db.getAllAsync<{ id: number }>('SELECT id FROM route_points;');

    assert.equal(version?.user_version, SCHEMA_VERSION);
    assert.equal(points.length, OFFICIAL_ROUTE_POINT_COUNT);
  } finally {
    close();
  }
});

test('repeated initialization is safe and preserves recorded visits', async () => {
  const { close, db } = createInMemoryTestDatabase();

  try {
    await initializeDatabase(db);
    await db.runAsync(
      `INSERT INTO visits (
         id, point_id, installation_code, meter_number, previous_reading, current_reading,
         photo_uri, latitude, longitude, captured_at, sync_status
       )
       VALUES ('visit-1', 101, 'INST-1', 'MTR-1', 100, 180,
         'file:///documents/visit-evidence/photo.jpg', -3.73, -38.49,
         '2026-03-01T12:00:00.000Z', 'pending');`,
    );

    // MARK: the provider reopens the database on a cold start, so this path runs
    // again on every launch and must never rebuild or drop what is stored
    await initializeDatabase(db);
    await initializeDatabase(db);

    const points = await db.getAllAsync<{ id: number }>('SELECT id FROM route_points;');
    const visits = await db.getAllAsync<{ id: string; sync_status: string }>(
      'SELECT id, sync_status FROM visits;',
    );

    assert.equal(points.length, OFFICIAL_ROUTE_POINT_COUNT);
    assert.deepEqual(visits, [{ id: 'visit-1', sync_status: 'pending' }]);
  } finally {
    close();
  }
});
