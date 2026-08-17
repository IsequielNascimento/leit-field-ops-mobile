import assert from 'node:assert/strict';
import test from 'node:test';

import type { Visit, VisitSyncStatus } from '../../domain/entities/Visit';
import type { VisitRepository } from '../../domain/repositories/VisitRepository';
import { synchronizePendingVisits } from '../../domain/use-cases/SynchronizePendingVisits';
import { SimulatedVisitSyncGateway, SIMULATED_UNREACHABLE_MESSAGE } from './SimulatedVisitSyncGateway';

function createVisit(syncStatus: VisitSyncStatus = 'pending'): Visit {
  return {
    id: 'visit-1',
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

const noDelay = { delayMs: 0, delay: async () => undefined };

test('accepts the visit after awaiting its delay', async () => {
  const awaited: number[] = [];
  const gateway = new SimulatedVisitSyncGateway({
    delayMs: 500,
    delay: async (milliseconds) => {
      awaited.push(milliseconds);
    },
  });

  const outcome = await gateway.sendVisit(createVisit());

  assert.deepEqual(outcome, { kind: 'accepted' });
  assert.deepEqual(awaited, [500]);
});

test('drives the state machine to synced without any remote dependency', async () => {
  const repository = createRepository([createVisit()]);
  const gateway = new SimulatedVisitSyncGateway(noDelay);

  const result = await synchronizePendingVisits(repository, gateway);

  assert.equal((await repository.getVisitById('visit-1'))?.syncStatus, 'synced');
  assert.deepEqual(result, { kind: 'finished', summary: { attempted: 1, synced: 1, failed: 0 } });
});

test('refuses the send when the service cannot be reached', async () => {
  const gateway = new SimulatedVisitSyncGateway({ ...noDelay, canReachService: () => false });

  assert.deepEqual(await gateway.sendVisit(createVisit()), {
    kind: 'rejected',
    message: SIMULATED_UNREACHABLE_MESSAGE,
  });
});

test('walks pending to syncing to error to syncing to synced with no network', async () => {
  const repository = createRepository([createVisit()]);
  let reachable = false;
  const gateway = new SimulatedVisitSyncGateway({ ...noDelay, canReachService: () => reachable });
  const path: string[] = [];
  const record = (visit: { syncStatus: string }) => path.push(visit.syncStatus);

  const failedRun = await synchronizePendingVisits(repository, gateway, record);
  const afterFailure = await repository.getVisitById('visit-1');

  reachable = true;

  const retryRun = await synchronizePendingVisits(repository, gateway, record);

  assert.equal(afterFailure?.syncStatus, 'error');
  assert.deepEqual(path, ['syncing', 'error', 'syncing', 'synced']);
  assert.equal((await repository.getVisitById('visit-1'))?.syncStatus, 'synced');
  assert.deepEqual(failedRun, { kind: 'finished', summary: { attempted: 1, synced: 0, failed: 1 } });
  assert.deepEqual(retryRun, { kind: 'finished', summary: { attempted: 1, synced: 1, failed: 0 } });
});
