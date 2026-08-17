import assert from 'node:assert/strict';
import test from 'node:test';

import type { Visit, VisitSyncStatus } from '../entities/Visit';
import type { VisitRepository } from '../repositories/VisitRepository';
import type { VisitSyncGateway, VisitSyncOutcome } from '../services/VisitSyncService';
import { VisitSyncRunner } from './VisitSyncRunner';

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

interface BlockingGateway {
  gateway: VisitSyncGateway;
  release: () => void;
  sent: string[];
}

function createBlockingGateway(outcome: VisitSyncOutcome = { kind: 'accepted' }): BlockingGateway {
  const sent: string[] = [];
  let unblock = () => {};
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });

  return {
    gateway: {
      sendVisit: async (visit) => {
        sent.push(visit.id);
        await gate;
        return outcome;
      },
    },
    release: () => unblock(),
    sent,
  };
}

test('a second trigger during a run is skipped instead of starting a second pass', async () => {
  const repository = createRepository([createVisit('1'), createVisit('22')]);
  const { gateway, release, sent } = createBlockingGateway();
  const runner = new VisitSyncRunner(repository, gateway);

  const first = runner.run();
  const skipped = await runner.run();

  assert.deepEqual(skipped, { kind: 'skipped', reason: 'already-running' });
  assert.equal(runner.isRunning(), true);

  release();
  const finished = await first;

  assert.deepEqual(sent, ['1', '22']);
  assert.deepEqual(finished, { kind: 'finished', summary: { attempted: 2, synced: 2, failed: 0 } });
  assert.equal(runner.isRunning(), false);
});

test('many overlapping triggers still produce a single pass over the queue', async () => {
  const repository = createRepository([createVisit('1')]);
  const { gateway, release, sent } = createBlockingGateway();
  const runner = new VisitSyncRunner(repository, gateway);

  const first = runner.run();
  const others = await Promise.all([runner.run(), runner.run(), runner.run()]);

  release();
  await first;

  assert.deepEqual(sent, ['1']);
  assert.deepEqual(
    others,
    Array.from({ length: 3 }, () => ({ kind: 'skipped', reason: 'already-running' })),
  );
});

test('the guard releases so a later trigger runs normally', async () => {
  const repository = createRepository([createVisit('1'), createVisit('22')]);
  let calls = 0;
  const runner = new VisitSyncRunner(repository, {
    sendVisit: async () => {
      calls += 1;
      return calls === 1 ? { kind: 'rejected', message: 'refused' } : { kind: 'accepted' };
    },
  });

  const first = await runner.run();
  const second = await runner.run();

  assert.deepEqual(first, { kind: 'finished', summary: { attempted: 2, synced: 1, failed: 1 } });
  assert.deepEqual(second, { kind: 'finished', summary: { attempted: 1, synced: 1, failed: 0 } });
  assert.equal((await repository.getVisitById('1'))?.syncStatus, 'synced');
});

test('the guard releases after a run that reports a local failure', async () => {
  const repository = createRepository([createVisit('1')]);
  const workingRead = repository.getVisitsBySyncStatus;
  let fail = true;
  repository.getVisitsBySyncStatus = async (syncStatus) => {
    if (fail) {
      throw new Error('SQLite unavailable');
    }

    return workingRead(syncStatus);
  };
  const runner = new VisitSyncRunner(repository, { sendVisit: async () => ({ kind: 'accepted' }) });

  assert.deepEqual(await runner.run(), { kind: 'failed', message: 'SQLite unavailable' });
  assert.equal(runner.isRunning(), false);

  fail = false;

  assert.deepEqual(await runner.run(), {
    kind: 'finished',
    summary: { attempted: 1, synced: 1, failed: 0 },
  });
});
