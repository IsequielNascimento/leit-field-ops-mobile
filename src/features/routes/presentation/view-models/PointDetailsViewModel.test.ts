import assert from 'node:assert/strict';
import test from 'node:test';

import type { RoutePoint } from '../../domain/entities/RoutePoint';
import type { RouteRepository } from '../../domain/repositories/RouteRepository';
import { loadPointDetails, parsePointId } from './PointDetailsViewModel';

const persistedPoint: RoutePoint = {
  id: 4,
  routeId: 'LEIT-ALDEOTA-001',
  order: 4,
  installationCode: 'LOCAL-INSTALLATION',
  customer: 'Local customer',
  referencePoint: 'Local reference',
  address: 'Local address',
  latitude: -3.7,
  longitude: -38.5,
  meterNumber: 'LOCAL-METER',
  previousReading: 318,
  status: 'pending',
};

function createRepository(getPointById: RouteRepository['getPointById']): RouteRepository {
  return {
    getPointById,
    getRouteById: async () => null,
    saveRoute: async () => undefined,
  };
}

test('parses only one positive safe integer point identifier', () => {
  assert.equal(parsePointId('4'), 4);
  assert.equal(parsePointId('0'), null);
  assert.equal(parsePointId('-1'), null);
  assert.equal(parsePointId('4abc'), null);
  assert.equal(parsePointId(['4']), null);
  assert.equal(parsePointId(undefined), null);
  assert.equal(parsePointId('9007199254740992'), null);
});

test('loads the exact persisted point by identifier', async () => {
  const requestedIds: number[] = [];
  const state = await loadPointDetails(
    createRepository(async (pointId) => {
      requestedIds.push(pointId);
      return persistedPoint;
    }),
    '4',
  );

  assert.deepEqual(requestedIds, [4]);
  assert.deepEqual(state, { kind: 'loaded', point: persistedPoint });
});

test('rejects malformed identifiers without querying the repository', async () => {
  let queryCount = 0;
  const state = await loadPointDetails(
    createRepository(async () => {
      queryCount += 1;
      return persistedPoint;
    }),
    'not-a-point',
  );

  assert.deepEqual(state, { kind: 'invalid' });
  assert.equal(queryCount, 0);
});

test('returns empty when the persisted point does not exist', async () => {
  const state = await loadPointDetails(createRepository(async () => null), '99');
  assert.deepEqual(state, { kind: 'empty' });
});

test('returns error state when local persistence fails', async () => {
  const state = await loadPointDetails(
    createRepository(async () => {
      throw new Error('SQLite unavailable');
    }),
    '4',
  );

  assert.deepEqual(state, { kind: 'error', message: 'SQLite unavailable' });
});
