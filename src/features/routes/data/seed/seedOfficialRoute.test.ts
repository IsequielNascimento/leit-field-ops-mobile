import assert from 'node:assert/strict';
import test from 'node:test';

import { runMigrations } from '@/shared/data/database/migrations';
import { createInMemoryTestDatabase } from '@/shared/data/database/testing/inMemoryTestDatabase';
import { SQLiteRouteRepository } from '../repositories/SQLiteRouteRepository';
import {
  OFFICIAL_ROUTE_ID,
  OFFICIAL_ROUTE_POINT_COUNT,
  getOfficialRoute,
} from './officialRouteSource';
import { seedOfficialRoute } from './seedOfficialRoute';

async function migratedDatabase() {
  const database = createInMemoryTestDatabase();
  await runMigrations(database.db);
  return database;
}

test('seeding persists the official route and its points', async () => {
  const { close, db } = await migratedDatabase();

  try {
    await seedOfficialRoute(db);

    const route = await new SQLiteRouteRepository(db).getRouteById(OFFICIAL_ROUTE_ID);

    assert.ok(route);
    assert.equal(route.points.length, OFFICIAL_ROUTE_POINT_COUNT);
    assert.deepEqual(
      route.points.map((point) => point.order),
      getOfficialRoute().points.map((point) => point.order),
    );
  } finally {
    close();
  }
});

test('seeding repeatedly never duplicates the route or its points', async () => {
  const { close, db } = await migratedDatabase();

  try {
    await seedOfficialRoute(db);
    await seedOfficialRoute(db);
    await seedOfficialRoute(db);

    const routes = await db.getAllAsync<{ id: string }>('SELECT id FROM routes;');
    const points = await db.getAllAsync<{ id: number }>('SELECT id FROM route_points;');

    assert.equal(routes.length, 1);
    assert.equal(points.length, OFFICIAL_ROUTE_POINT_COUNT);
  } finally {
    close();
  }
});

test('a visit already recorded survives a later seed run', async () => {
  const { close, db } = await migratedDatabase();

  try {
    await seedOfficialRoute(db);
    await db.runAsync(
      `INSERT INTO visits (
         id, point_id, installation_code, meter_number, previous_reading, current_reading,
         photo_uri, latitude, longitude, captured_at, sync_status
       )
       VALUES ('visit-1', 101, 'INST-1', 'MTR-1', 100, 180,
         'file:///documents/visit-evidence/photo.jpg', -3.73, -38.49,
         '2026-03-01T12:00:00.000Z', 'pending');`,
    );

    await seedOfficialRoute(db);

    const visits = await db.getAllAsync<{ id: string }>('SELECT id FROM visits;');
    assert.deepEqual(visits, [{ id: 'visit-1' }]);
  } finally {
    close();
  }
});
