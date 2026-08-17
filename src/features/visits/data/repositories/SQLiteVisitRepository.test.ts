import assert from 'node:assert/strict';
import test from 'node:test';

import { seedOfficialRoute } from '@/features/routes/data/seed/seedOfficialRoute';
import { runMigrations } from '@/shared/data/database/migrations';
import { createInMemoryTestDatabase } from '@/shared/data/database/testing/inMemoryTestDatabase';
import type { Visit } from '../../domain/entities/Visit';
import { SQLiteVisitRepository } from './SQLiteVisitRepository';

const VISIT: Visit = {
  id: 'visit-1',
  pointId: 101,
  installationCode: 'INST-1',
  meterNumber: 'MTR-1',
  previousReading: 100,
  currentReading: 180.5,
  photoUri: 'file:///documents/visit-evidence/visit-1.jpg',
  latitude: -3.7327,
  longitude: -38.4969,
  capturedAt: '2026-03-01T12:00:00.000Z',
  syncStatus: 'pending',
};

async function seededDatabase() {
  const database = createInMemoryTestDatabase();
  await runMigrations(database.db);
  await seedOfficialRoute(database.db);
  return database;
}

test('a completed visit is stored with every field and read back unchanged', async () => {
  const { close, db } = await seededDatabase();

  try {
    await new SQLiteVisitRepository(db).saveVisit(VISIT);

    // MARK: a fresh repository stands in for the app being reopened
    const reopened = await new SQLiteVisitRepository(db).getVisitById(VISIT.id);

    assert.deepEqual(reopened, VISIT);
  } finally {
    close();
  }
});

test('a visit is queryable by point and by synchronization status', async () => {
  const { close, db } = await seededDatabase();
  const repository = new SQLiteVisitRepository(db);

  try {
    await repository.saveVisit(VISIT);
    await repository.saveVisit({ ...VISIT, id: 'visit-2', pointId: 102, syncStatus: 'synced' });

    assert.deepEqual(
      (await repository.getVisitsByPointId(101)).map((visit) => visit.id),
      ['visit-1'],
    );
    assert.deepEqual(
      (await repository.getVisitsBySyncStatus('pending')).map((visit) => visit.id),
      ['visit-1'],
    );
    assert.deepEqual(
      (await repository.getVisitsBySyncStatus('synced')).map((visit) => visit.id),
      ['visit-2'],
    );
  } finally {
    close();
  }
});

test('synchronization status transitions are persisted, not held in memory', async () => {
  const { close, db } = await seededDatabase();
  const repository = new SQLiteVisitRepository(db);

  try {
    await repository.saveVisit(VISIT);

    await repository.updateSyncStatus(VISIT.id, 'syncing');
    assert.equal((await repository.getVisitById(VISIT.id))?.syncStatus, 'syncing');

    await repository.updateSyncStatus(VISIT.id, 'error');
    assert.equal((await repository.getVisitById(VISIT.id))?.syncStatus, 'error');

    await repository.updateSyncStatus(VISIT.id, 'synced');
    assert.equal((await repository.getVisitById(VISIT.id))?.syncStatus, 'synced');
  } finally {
    close();
  }
});

test('saving the same visit twice updates it instead of creating a duplicate', async () => {
  const { close, db } = await seededDatabase();
  const repository = new SQLiteVisitRepository(db);

  try {
    await repository.saveVisit(VISIT);
    await repository.saveVisit({ ...VISIT, currentReading: 190 });

    const visits = await repository.getVisitsByPointId(VISIT.pointId);

    assert.equal(visits.length, 1);
    assert.equal(visits[0].currentReading, 190);
  } finally {
    close();
  }
});

test('a visit cannot be stored for a point that is not in the local route', async () => {
  const { close, db } = await seededDatabase();

  try {
    await assert.rejects(() =>
      new SQLiteVisitRepository(db).saveVisit({ ...VISIT, id: 'visit-orphan', pointId: 9999 }),
    );
  } finally {
    close();
  }
});
