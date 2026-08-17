import assert from 'node:assert/strict';
import test from 'node:test';

import { SCHEMA_VERSION, runMigrations } from './migrations';
import { createInMemoryTestDatabase } from './testing/inMemoryTestDatabase';

const VISIT_COLUMNS = `id, point_id, installation_code, meter_number, previous_reading,
  current_reading, photo_uri, latitude, longitude, captured_at, sync_status`;

const VISIT_VALUES = `'visit-1', 1, 'INST-1', 'MTR-1', 100, 180,
  'file:///documents/visit-evidence/photo.jpg', -3.73, -38.49, '2026-03-01T12:00:00.000Z', 'pending'`;

async function seedPoint(db: ReturnType<typeof createInMemoryTestDatabase>['db']): Promise<void> {
  await db.runAsync(
    `INSERT INTO routes (id, name, scheduled_date, city, state, neighborhood, status)
     VALUES ('R-1', 'Route', '2026-03-01', 'Fortaleza', 'CE', 'Aldeota', 'assigned');`,
  );
  await db.runAsync(
    `INSERT INTO route_points (
       id, route_id, visit_order, installation_code, customer, reference_point,
       address, latitude, longitude, meter_number, previous_reading, status
     )
     VALUES (1, 'R-1', 1, 'INST-1', 'Customer', 'Reference', 'Address', -3.73, -38.49, 'MTR-1', 100, 'pending');`,
  );
}

async function readVersion(
  db: ReturnType<typeof createInMemoryTestDatabase>['db'],
): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

test('creates the full schema and reaches the supported version', async () => {
  const { close, db } = createInMemoryTestDatabase();

  try {
    await runMigrations(db);

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
    );

    assert.deepEqual(
      tables.map((table) => table.name).filter((name) => !name.startsWith('sqlite_')),
      ['route_points', 'routes', 'visits'],
    );
    assert.equal(await readVersion(db), SCHEMA_VERSION);
  } finally {
    close();
  }
});

test('re-running migrations is a no-op that keeps existing rows', async () => {
  const { close, db } = createInMemoryTestDatabase();

  try {
    await runMigrations(db);
    await seedPoint(db);
    await db.runAsync(`INSERT INTO visits (${VISIT_COLUMNS}) VALUES (${VISIT_VALUES});`);

    await runMigrations(db);
    await runMigrations(db);

    const visits = await db.getAllAsync<{ id: string }>('SELECT id FROM visits;');
    const points = await db.getAllAsync<{ id: number }>('SELECT id FROM route_points;');

    assert.deepEqual(visits, [{ id: 'visit-1' }]);
    assert.equal(points.length, 1);
    assert.equal(await readVersion(db), SCHEMA_VERSION);
  } finally {
    close();
  }
});

test('upgrading from version 1 preserves already recorded visits', async () => {
  const { close, db } = createInMemoryTestDatabase();

  try {
    await runMigrations(db);
    await seedPoint(db);
    await db.runAsync(`INSERT INTO visits (${VISIT_COLUMNS}) VALUES (${VISIT_VALUES});`);

    // MARK: rewind to version 1 so the version-2 step runs against real data
    await db.execAsync('PRAGMA user_version = 1;');
    await runMigrations(db);

    const visits = await db.getAllAsync<{ id: string; sync_status: string }>(
      'SELECT id, sync_status FROM visits;',
    );

    assert.deepEqual(visits, [{ id: 'visit-1', sync_status: 'pending' }]);
    assert.equal(await readVersion(db), SCHEMA_VERSION);
  } finally {
    close();
  }
});

test('the migrated schema accepts the error sync status and rejects unknown ones', async () => {
  const { close, db } = createInMemoryTestDatabase();

  try {
    await runMigrations(db);
    await seedPoint(db);

    await db.runAsync(
      `INSERT INTO visits (${VISIT_COLUMNS}) VALUES (${VISIT_VALUES.replace("'pending'", "'error'")});`,
    );

    await assert.rejects(() =>
      db.runAsync(
        `INSERT INTO visits (${VISIT_COLUMNS})
         VALUES (${VISIT_VALUES.replace("'visit-1'", "'visit-2'").replace("'pending'", "'unknown'")});`,
      ),
    );
  } finally {
    close();
  }
});

test('refuses to open a database written by a newer app build', async () => {
  const { close, db } = createInMemoryTestDatabase();

  try {
    await runMigrations(db);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1};`);

    await assert.rejects(() => runMigrations(db), /newer than the version/);
  } finally {
    close();
  }
});
