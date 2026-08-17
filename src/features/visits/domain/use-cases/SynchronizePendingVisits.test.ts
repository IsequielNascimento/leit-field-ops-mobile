import assert from 'node:assert/strict';
import test from 'node:test';

import type { Visit, VisitSyncStatus } from '../entities/Visit';
import type { VisitRepository } from '../repositories/VisitRepository';
import type { VisitSyncGateway, VisitSyncOutcome } from '../services/VisitSyncService';
import { synchronizePendingVisits } from './SynchronizePendingVisits';

function createVisit(id: string, syncStatus: VisitSyncStatus = 'pending'): Visit {
  return {
    id,
    pointId: Number(id.replace(/\D/g, '')) || 1,
    installationCode: `INSTALL-${id}`,
    meterNumber: `METER-${id}`,
    previousReading: 100,
    currentReading: 120,
    photoUri: `file:///${id}.jpg`,
    latitude: -3.7327,
    longitude: -38.5267,
    capturedAt: `2026-08-16T0${id.length}:00:00.000Z`,
    syncStatus,
  };
}

interface FakeRepository {
  repository: VisitRepository;
  updates: { visitId: string; syncStatus: VisitSyncStatus }[];
  stored: Map<string, Visit>;
}

function createRepository(visits: Visit[]): FakeRepository {
  const stored = new Map(visits.map((visit) => [visit.id, visit]));
  const updates: { visitId: string; syncStatus: VisitSyncStatus }[] = [];

  const repository: VisitRepository = {
    saveVisit: async (visit) => {
      stored.set(visit.id, visit);
    },
    getVisitById: async (visitId) => stored.get(visitId) ?? null,
    getVisitsByPointId: async (pointId) =>
      [...stored.values()].filter((visit) => visit.pointId === pointId),
    getVisitsBySyncStatus: async (syncStatus) =>
      [...stored.values()].filter((visit) => visit.syncStatus === syncStatus),
    updateSyncStatus: async (visitId, syncStatus) => {
      updates.push({ visitId, syncStatus });
      const visit = stored.get(visitId);

      if (visit) {
        stored.set(visitId, { ...visit, syncStatus });
      }
    },
  };

  return { repository, updates, stored };
}

function createGateway(
  sendVisit: (visit: Visit) => Promise<VisitSyncOutcome>,
): VisitSyncGateway {
  return { sendVisit };
}

test('moves every pending visit through syncing and then synced', async () => {
  const { repository, updates, stored } = createRepository([createVisit('1'), createVisit('22')]);
  const seenBySender: VisitSyncStatus[] = [];

  const result = await synchronizePendingVisits(
    repository,
    createGateway(async (visit) => {
      seenBySender.push(visit.syncStatus);
      return { kind: 'accepted' };
    }),
  );

  assert.deepEqual(updates, [
    { visitId: '1', syncStatus: 'syncing' },
    { visitId: '1', syncStatus: 'synced' },
    { visitId: '22', syncStatus: 'syncing' },
    { visitId: '22', syncStatus: 'synced' },
  ]);
  assert.deepEqual(seenBySender, ['syncing', 'syncing']);
  assert.equal(stored.get('1')?.syncStatus, 'synced');
  assert.equal(stored.get('22')?.syncStatus, 'synced');
  assert.deepEqual(result, { kind: 'finished', summary: { attempted: 2, synced: 2, failed: 0 } });
});

test('reports each persisted transition to the progress listener', async () => {
  const { repository } = createRepository([createVisit('1')]);
  const progress: string[] = [];

  await synchronizePendingVisits(
    repository,
    createGateway(async () => ({ kind: 'accepted' })),
    (visit, previousStatus) => progress.push(`${previousStatus}->${visit.syncStatus}`),
  );

  assert.deepEqual(progress, ['pending->syncing', 'syncing->synced']);
});

test('only sends records that are pending', async () => {
  const { repository } = createRepository([
    createVisit('1', 'synced'),
    createVisit('22', 'pending'),
  ]);
  const sent: string[] = [];

  const result = await synchronizePendingVisits(
    repository,
    createGateway(async (visit) => {
      sent.push(visit.id);
      return { kind: 'accepted' };
    }),
  );

  assert.deepEqual(sent, ['22']);
  assert.deepEqual(result, { kind: 'finished', summary: { attempted: 1, synced: 1, failed: 0 } });
});

test('does not call the sender when nothing is pending', async () => {
  const { repository } = createRepository([createVisit('1', 'synced')]);
  let calls = 0;

  const result = await synchronizePendingVisits(
    repository,
    createGateway(async () => {
      calls += 1;
      return { kind: 'accepted' };
    }),
  );

  assert.equal(calls, 0);
  assert.deepEqual(result, { kind: 'finished', summary: { attempted: 0, synced: 0, failed: 0 } });
});

test('restores a rejected record to pending and keeps processing the queue', async () => {
  const { repository, updates, stored } = createRepository([createVisit('1'), createVisit('22')]);

  const result = await synchronizePendingVisits(
    repository,
    createGateway(async (visit) =>
      visit.id === '1' ? { kind: 'rejected', message: 'refused' } : { kind: 'accepted' },
    ),
  );

  assert.deepEqual(updates, [
    { visitId: '1', syncStatus: 'syncing' },
    { visitId: '1', syncStatus: 'pending' },
    { visitId: '22', syncStatus: 'syncing' },
    { visitId: '22', syncStatus: 'synced' },
  ]);
  assert.equal(stored.get('1')?.syncStatus, 'pending');
  assert.equal(stored.get('22')?.syncStatus, 'synced');
  assert.deepEqual(result, { kind: 'finished', summary: { attempted: 2, synced: 1, failed: 1 } });
});

test('treats a thrown sender error as a rejection and leaves no record in syncing', async () => {
  const { repository, stored } = createRepository([createVisit('1')]);

  const result = await synchronizePendingVisits(
    repository,
    createGateway(async () => {
      throw new Error('sender unavailable');
    }),
  );

  assert.equal(stored.get('1')?.syncStatus, 'pending');
  assert.deepEqual(result, { kind: 'finished', summary: { attempted: 1, synced: 0, failed: 1 } });
});

function createRepositoryFailingWriteOf(status: VisitSyncStatus): VisitRepository {
  const { repository } = createRepository([createVisit('1')]);
  const write = repository.updateSyncStatus;

  repository.updateSyncStatus = async (visitId, syncStatus) => {
    if (syncStatus === status) {
      throw new Error('SQLite write failed');
    }

    await write(visitId, syncStatus);
  };

  return repository;
}

test('reports a failure instead of rejecting when the syncing write fails', async () => {
  const result = await synchronizePendingVisits(
    createRepositoryFailingWriteOf('syncing'),
    createGateway(async () => ({ kind: 'accepted' })),
  );

  assert.deepEqual(result, { kind: 'failed', message: 'SQLite write failed' });
});

test('reports a failure instead of rejecting when the synced write fails', async () => {
  const result = await synchronizePendingVisits(
    createRepositoryFailingWriteOf('synced'),
    createGateway(async () => ({ kind: 'accepted' })),
  );

  assert.deepEqual(result, { kind: 'failed', message: 'SQLite write failed' });
});

test('reports a failure instead of rejecting when restoring a refused record fails', async () => {
  const repository = createRepositoryFailingWriteOf('pending');

  const result = await synchronizePendingVisits(
    repository,
    createGateway(async () => ({ kind: 'rejected', message: 'refused' })),
  );

  assert.deepEqual(result, { kind: 'failed', message: 'SQLite write failed' });
});

test('fails without sending anything when the local queue cannot be read', async () => {
  const { repository } = createRepository([]);
  repository.getVisitsBySyncStatus = async () => {
    throw new Error('SQLite unavailable');
  };
  let calls = 0;

  const result = await synchronizePendingVisits(
    repository,
    createGateway(async () => {
      calls += 1;
      return { kind: 'accepted' };
    }),
  );

  assert.equal(calls, 0);
  assert.deepEqual(result, { kind: 'failed', message: 'SQLite unavailable' });
});
