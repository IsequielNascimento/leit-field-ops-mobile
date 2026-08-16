import assert from 'node:assert/strict';
import test from 'node:test';

import type { Visit } from '../entities/Visit';
import type { VisitRepository } from '../repositories/VisitRepository';
import { buildPendingVisit, completeVisit, type CompleteVisitInput } from './CompleteVisit';

const input: CompleteVisitInput = {
  pointId: 4,
  installationCode: 'LOCAL-INSTALLATION',
  meterNumber: 'LOCAL-METER',
  previousReading: 318,
  currentReading: 341,
  photoUri: 'file:///documents/visit-evidence/photo.jpg',
  latitude: -3.7327,
  longitude: -38.5267,
  capturedAt: '2026-08-16T01:20:30.000Z',
};

function recordingRepository(saved: Visit[], saveVisit?: VisitRepository['saveVisit']): VisitRepository {
  return {
    saveVisit:
      saveVisit ??
      (async (visit) => {
        saved.push(visit);
      }),
    getVisitById: async () => null,
    getVisitsByPointId: async () => [],
    getVisitsBySyncStatus: async () => [],
    updateSyncStatus: async () => undefined,
  };
}

test('records every field the visit needs and starts it as pending', () => {
  assert.deepEqual(buildPendingVisit(input, 'visit-1'), {
    id: 'visit-1',
    pointId: 4,
    installationCode: 'LOCAL-INSTALLATION',
    meterNumber: 'LOCAL-METER',
    previousReading: 318,
    currentReading: 341,
    photoUri: 'file:///documents/visit-evidence/photo.jpg',
    latitude: -3.7327,
    longitude: -38.5267,
    capturedAt: '2026-08-16T01:20:30.000Z',
    syncStatus: 'pending',
  });
});

test('persists the completed visit through the repository exactly once', async () => {
  const saved: Visit[] = [];

  const result = await completeVisit(recordingRepository(saved), input, () => 'visit-1');

  assert.equal(saved.length, 1);
  assert.equal(saved[0].syncStatus, 'pending');
  assert.deepEqual(result, { kind: 'completed', visit: saved[0] });
});

test('gives each completed visit its own identifier', async () => {
  const saved: Visit[] = [];
  const repository = recordingRepository(saved);

  await completeVisit(repository, input);
  await completeVisit(repository, input);

  assert.equal(saved.length, 2);
  assert.notEqual(saved[0].id, saved[1].id);
});

test('reports a storage failure instead of throwing or reporting success', async () => {
  const result = await completeVisit(
    recordingRepository([], async () => {
      throw new Error('SQLite unavailable');
    }),
    input,
    () => 'visit-1',
  );

  assert.deepEqual(result, { kind: 'failed', message: 'SQLite unavailable' });
});
