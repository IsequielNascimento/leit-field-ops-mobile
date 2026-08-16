import assert from 'node:assert/strict';
import test from 'node:test';

import type { Visit, VisitSyncStatus } from '../../domain/entities/Visit';
import type { VisitRepository } from '../../domain/repositories/VisitRepository';
import type { VisitSyncGateway } from '../../domain/services/VisitSyncService';
import {
  applyVisitSyncTransition,
  describeVisitSyncState,
  EMPTY_VISIT_SYNC_SUMMARY,
  loadVisitSyncSummary,
  runManualSync,
} from './VisitSyncViewModel';

function createVisit(id: string, syncStatus: VisitSyncStatus): Visit {
  return {
    id,
    pointId: 101,
    installationCode: 'INSTALL-101',
    meterNumber: 'METER-101',
    previousReading: 100,
    currentReading: 130,
    photoUri: 'file:///visit.jpg',
    latitude: -3.7327,
    longitude: -38.5267,
    capturedAt: '2026-08-16T01:00:00.000Z',
    syncStatus,
  };
}

function createRepository(visits: Visit[]): VisitRepository {
  const stored = new Map(visits.map((visit) => [visit.id, visit]));

  return {
    saveVisit: async (visit) => {
      stored.set(visit.id, visit);
    },
    getVisitById: async (visitId) => stored.get(visitId) ?? null,
    getVisitsByPointId: async (pointId) =>
      [...stored.values()].filter((visit) => visit.pointId === pointId),
    getVisitsBySyncStatus: async (syncStatus) =>
      [...stored.values()].filter((visit) => visit.syncStatus === syncStatus),
    updateSyncStatus: async (visitId, syncStatus) => {
      const visit = stored.get(visitId);

      if (visit) {
        stored.set(visitId, { ...visit, syncStatus });
      }
    },
  };
}

const acceptingGateway: VisitSyncGateway = { sendVisit: async () => ({ kind: 'accepted' }) };

test('counts the synchronization queue from persisted visits', async () => {
  const repository = createRepository([
    createVisit('a', 'pending'),
    createVisit('b', 'pending'),
    createVisit('c', 'synced'),
  ]);

  assert.deepEqual(await loadVisitSyncSummary(repository), {
    pending: 2,
    syncing: 0,
    synced: 1,
  });
});

test('reports an empty queue summary when local storage cannot be read', async () => {
  const repository = createRepository([]);
  repository.getVisitsBySyncStatus = async () => {
    throw new Error('SQLite unavailable');
  };

  assert.deepEqual(await loadVisitSyncSummary(repository), EMPTY_VISIT_SYNC_SUMMARY);
});

test('the manual command completes with the number of synchronized visits', async () => {
  const repository = createRepository([createVisit('a', 'pending'), createVisit('b', 'pending')]);

  const state = await runManualSync(repository, acceptingGateway);

  assert.deepEqual(state, { kind: 'completed', synced: 2, failed: 0 });
  assert.deepEqual(await loadVisitSyncSummary(repository), {
    pending: 0,
    syncing: 0,
    synced: 2,
  });
});

test('the manual command completes with zero work when nothing is pending', async () => {
  const repository = createRepository([createVisit('a', 'synced')]);

  assert.deepEqual(await runManualSync(repository, acceptingGateway), {
    kind: 'completed',
    synced: 0,
    failed: 0,
  });
});

test('the manual command surfaces a local storage failure', async () => {
  const repository = createRepository([]);
  repository.getVisitsBySyncStatus = async () => {
    throw new Error('SQLite unavailable');
  };

  assert.deepEqual(await runManualSync(repository, acceptingGateway), {
    kind: 'failed',
    message: 'SQLite unavailable',
  });
});

test('the manual command reports records the sender refused as still pending', async () => {
  const repository = createRepository([createVisit('a', 'pending')]);

  const state = await runManualSync(repository, {
    sendVisit: async () => ({ kind: 'rejected', message: 'refused' }),
  });

  assert.deepEqual(state, { kind: 'completed', synced: 0, failed: 1 });
  assert.deepEqual(await loadVisitSyncSummary(repository), {
    pending: 1,
    syncing: 0,
    synced: 0,
  });
});

test('queue counts follow each transition while a run is in progress', () => {
  const start = { pending: 2, syncing: 0, synced: 1 };
  const started = applyVisitSyncTransition(start, 'pending', 'syncing');
  const finished = applyVisitSyncTransition(started, 'syncing', 'synced');

  assert.deepEqual(started, { pending: 1, syncing: 1, synced: 1 });
  assert.deepEqual(finished, { pending: 1, syncing: 0, synced: 2 });
  assert.deepEqual(applyVisitSyncTransition(finished, 'synced', 'synced'), finished);
  assert.deepEqual(start, { pending: 2, syncing: 0, synced: 1 });
});

test('describes idle, syncing and completed feedback from real counts', () => {
  assert.equal(
    describeVisitSyncState({ kind: 'idle' }, { pending: 1, syncing: 0, synced: 0 }),
    '1 visit waiting to be sent.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'idle' }, { pending: 3, syncing: 0, synced: 0 }),
    '3 visits waiting to be sent.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'idle' }, EMPTY_VISIT_SYNC_SUMMARY),
    'No visits are waiting to be sent.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'syncing' }, { pending: 1, syncing: 1, synced: 0 }),
    'Sending pending visits…',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'completed', synced: 2, failed: 0 }, EMPTY_VISIT_SYNC_SUMMARY),
    '2 visits synchronized.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'completed', synced: 1, failed: 1 }, EMPTY_VISIT_SYNC_SUMMARY),
    '1 synchronized, 1 still pending.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'completed', synced: 0, failed: 0 }, EMPTY_VISIT_SYNC_SUMMARY),
    'No visits were waiting to be sent.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'failed', message: 'SQLite unavailable' }, EMPTY_VISIT_SYNC_SUMMARY),
    'SQLite unavailable',
  );
});
