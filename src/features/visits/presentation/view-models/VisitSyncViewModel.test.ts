import assert from 'node:assert/strict';
import test from 'node:test';

import type { Visit, VisitSyncStatus } from '../../domain/entities/Visit';
import type { VisitRepository } from '../../domain/repositories/VisitRepository';
import type { VisitSyncGateway } from '../../domain/services/VisitSyncService';
import { VisitSyncRunner } from '../../domain/use-cases/VisitSyncRunner';
import {
  applyVisitSyncTransition,
  describeVisitSyncState,
  eligibleForSyncCount,
  EMPTY_VISIT_SYNC_SUMMARY,
  loadVisitSyncSummary,
  runVisitSync,
  shouldTriggerReconnectSync,
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

function runnerFor(repository: VisitRepository, gateway: VisitSyncGateway = acceptingGateway) {
  return new VisitSyncRunner(repository, gateway);
}

test('counts the synchronization queue from persisted visits', async () => {
  const repository = createRepository([
    createVisit('a', 'pending'),
    createVisit('b', 'pending'),
    createVisit('c', 'synced'),
    createVisit('d', 'error'),
  ]);

  assert.deepEqual(await loadVisitSyncSummary(repository), {
    error: 1,
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

test('the sync command completes with the number of synchronized visits', async () => {
  const repository = createRepository([createVisit('a', 'pending'), createVisit('b', 'pending')]);

  const state = await runVisitSync(runnerFor(repository));

  assert.deepEqual(state, { kind: 'completed', synced: 2, failed: 0 });
  assert.deepEqual(await loadVisitSyncSummary(repository), {
    error: 0,
    pending: 0,
    syncing: 0,
    synced: 2,
  });
});

test('the sync command completes with zero work when nothing is eligible', async () => {
  const repository = createRepository([createVisit('a', 'synced')]);

  assert.deepEqual(await runVisitSync(runnerFor(repository)), {
    kind: 'completed',
    synced: 0,
    failed: 0,
  });
});

test('the sync command surfaces a local storage failure', async () => {
  const repository = createRepository([]);
  repository.getVisitsBySyncStatus = async () => {
    throw new Error('SQLite unavailable');
  };

  assert.deepEqual(await runVisitSync(runnerFor(repository)), {
    kind: 'failed',
    message: 'SQLite unavailable',
  });
});

test('the sync command reports refused records as failed and counts them as errors', async () => {
  const repository = createRepository([createVisit('a', 'pending')]);

  const state = await runVisitSync(
    runnerFor(repository, { sendVisit: async () => ({ kind: 'rejected', message: 'refused' }) }),
  );

  assert.deepEqual(state, { kind: 'completed', synced: 0, failed: 1 });
  assert.deepEqual(await loadVisitSyncSummary(repository), {
    error: 1,
    pending: 0,
    syncing: 0,
    synced: 0,
  });
});

test('a trigger arriving during a run resolves to no new screen state', async () => {
  const repository = createRepository([createVisit('a', 'pending')]);
  let unblock = () => {};
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const runner = runnerFor(repository, {
    sendVisit: async () => {
      await gate;
      return { kind: 'accepted' };
    },
  });

  const first = runVisitSync(runner);
  const second = await runVisitSync(runner);

  unblock();

  assert.equal(second, null);
  assert.deepEqual(await first, { kind: 'completed', synced: 1, failed: 0 });
});

test('a retry after a failure drives the same record to synced', async () => {
  const repository = createRepository([createVisit('a', 'pending')]);
  let reachable = false;
  const runner = runnerFor(repository, {
    sendVisit: async () => (reachable ? { kind: 'accepted' } : { kind: 'rejected', message: 'no route' }),
  });

  await runVisitSync(runner);
  const afterFailure = await loadVisitSyncSummary(repository);

  reachable = true;
  const retry = await runVisitSync(runner);

  assert.equal(afterFailure.error, 1);
  assert.deepEqual(retry, { kind: 'completed', synced: 1, failed: 0 });
  assert.deepEqual(await loadVisitSyncSummary(repository), {
    error: 0,
    pending: 0,
    syncing: 0,
    synced: 1,
  });
});

test('only an offline to online transition asks for a reconnect attempt', () => {
  assert.equal(shouldTriggerReconnectSync('offline', 'online'), true);
  assert.equal(shouldTriggerReconnectSync('online', 'online'), false);
  assert.equal(shouldTriggerReconnectSync('offline', 'offline'), false);
  assert.equal(shouldTriggerReconnectSync('online', 'offline'), false);
});

test('eligible records are the ones a retry would pick up', () => {
  assert.equal(eligibleForSyncCount(EMPTY_VISIT_SYNC_SUMMARY), 0);
  assert.equal(eligibleForSyncCount({ error: 2, pending: 1, syncing: 1, synced: 9 }), 4);
  assert.equal(eligibleForSyncCount({ error: 0, pending: 0, syncing: 0, synced: 4 }), 0);
});

test('queue counts follow each transition while a run is in progress', () => {
  const start = { error: 1, pending: 2, syncing: 0, synced: 1 };
  const started = applyVisitSyncTransition(start, 'pending', 'syncing');
  const finished = applyVisitSyncTransition(started, 'syncing', 'synced');
  const failed = applyVisitSyncTransition(finished, 'pending', 'error');

  assert.deepEqual(started, { error: 1, pending: 1, syncing: 1, synced: 1 });
  assert.deepEqual(finished, { error: 1, pending: 1, syncing: 0, synced: 2 });
  assert.deepEqual(failed, { error: 2, pending: 0, syncing: 0, synced: 2 });
  assert.deepEqual(applyVisitSyncTransition(finished, 'synced', 'synced'), finished);
  assert.deepEqual(start, { error: 1, pending: 2, syncing: 0, synced: 1 });
});

test('describes idle, syncing, completed and failed feedback from real counts', () => {
  assert.equal(
    describeVisitSyncState({ kind: 'idle' }, { error: 0, pending: 1, syncing: 0, synced: 0 }),
    '1 visit waiting to be sent.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'idle' }, { error: 0, pending: 3, syncing: 0, synced: 0 }),
    '3 visits waiting to be sent.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'idle' }, EMPTY_VISIT_SYNC_SUMMARY),
    'No visits are waiting to be sent.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'idle' }, { error: 1, pending: 0, syncing: 0, synced: 2 }),
    '1 visit failed to send and can be retried.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'idle' }, { error: 2, pending: 1, syncing: 0, synced: 0 }),
    '2 visits failed to send and can be retried. 1 more waiting to be sent.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'syncing' }, { error: 0, pending: 1, syncing: 1, synced: 0 }),
    'Sending pending visits…',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'completed', synced: 2, failed: 0 }, EMPTY_VISIT_SYNC_SUMMARY),
    '2 visits synchronized.',
  );
  assert.equal(
    describeVisitSyncState({ kind: 'completed', synced: 1, failed: 1 }, EMPTY_VISIT_SYNC_SUMMARY),
    '1 synchronized, 1 failed and kept on this device.',
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
