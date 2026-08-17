import assert from 'node:assert/strict';
import test from 'node:test';

import type { RouteAggregate } from '../../domain/entities/Route';
import type { RouteRepository } from '../../domain/repositories/RouteRepository';
import type { Visit } from '@/features/visits/domain/entities/Visit';
import type { VisitRepository } from '@/features/visits/domain/repositories/VisitRepository';
import {
  getRouteHomeSummary,
  loadRouteHome,
  OFFICIAL_ROUTE_ID,
} from './RouteHomeViewModel';

function createRoute(pointCount = 7): RouteAggregate {
  return {
    id: OFFICIAL_ROUTE_ID,
    name: 'Persisted route',
    scheduledDate: '2026-08-15',
    city: 'Fortaleza',
    state: 'CE',
    neighborhood: 'Aldeota',
    status: 'pending',
    points: Array.from({ length: pointCount }, (_, index) => ({
      id: index + 1,
      routeId: OFFICIAL_ROUTE_ID,
      order: index + 1,
      installationCode: `INSTALL-${index + 1}`,
      customer: `Customer ${index + 1}`,
      referencePoint: `Reference ${index + 1}`,
      address: `Address ${index + 1}`,
      latitude: -3.7,
      longitude: -38.5,
      meterNumber: `METER-${index + 1}`,
      previousReading: index,
      status: 'pending',
    })),
  };
}

function createRepository(getRouteById: RouteRepository['getRouteById']): RouteRepository {
  return {
    getPointById: async () => null,
    getRouteById,
    saveRoute: async () => undefined,
  };
}

function createVisitRepository(
  getVisitsByPointId: VisitRepository['getVisitsByPointId'] = async () => [],
): VisitRepository {
  return {
    saveVisit: async () => undefined,
    getVisitById: async () => null,
    getVisitsByPointId,
    getVisitsBySyncStatus: async () => [],
    updateSyncStatus: async () => undefined,
  };
}

test('loads the official route from the repository and preserves its ordered points', async () => {
  const route = createRoute();
  const requestedIds: string[] = [];
  const repository = createRepository(async (routeId) => {
    requestedIds.push(routeId);
    return route;
  });

  const state = await loadRouteHome(repository, createVisitRepository());

  assert.deepEqual(requestedIds, [OFFICIAL_ROUTE_ID]);
  assert.equal(state.kind, 'loaded');
  if (state.kind === 'loaded') {
    assert.equal(state.route.name, route.name);
    assert.deepEqual(state.route.points.map((point) => point.order), [1, 2, 3, 4, 5, 6, 7]);
  }
});

test('returns empty state when local storage has no route or points', async () => {
  const visitRepository = createVisitRepository();
  const missingRoute = await loadRouteHome(createRepository(async () => null), visitRepository);
  const emptyRoute = await loadRouteHome(
    createRepository(async () => createRoute(0)),
    visitRepository,
  );

  assert.deepEqual(missingRoute, { kind: 'empty' });
  assert.deepEqual(emptyRoute, { kind: 'empty' });
});

test('returns an error state when the local repository fails and succeeds on retry', async () => {
  let attempts = 0;
  const repository = createRepository(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('SQLite unavailable');
    }

    return createRoute();
  });

  const visitRepository = createVisitRepository();
  const failedState = await loadRouteHome(repository, visitRepository);
  const retriedState = await loadRouteHome(repository, visitRepository);

  assert.deepEqual(failedState, { kind: 'error', message: 'SQLite unavailable' });
  assert.equal(retriedState.kind, 'loaded');
  assert.equal(attempts, 2);
});

test('includes only the latest persisted visit for each route point', async () => {
  const visits: Visit[] = [
    {
      id: 'older',
      pointId: 1,
      installationCode: 'INSTALL-1',
      meterNumber: 'METER-1',
      previousReading: 0,
      currentReading: 10,
      photoUri: 'file:///older.jpg',
      latitude: -3.7,
      longitude: -38.5,
      capturedAt: '2026-08-15T08:00:00.000Z',
      syncStatus: 'pending',
    },
    {
      id: 'newer',
      pointId: 1,
      installationCode: 'INSTALL-1',
      meterNumber: 'METER-1',
      previousReading: 0,
      currentReading: 11,
      photoUri: 'file:///newer.jpg',
      latitude: -3.7,
      longitude: -38.5,
      capturedAt: '2026-08-16T08:00:00.000Z',
      syncStatus: 'pending',
    },
  ];

  const state = await loadRouteHome(
    createRepository(async () => createRoute(2)),
    createVisitRepository(async (pointId) => (pointId === 1 ? visits : [])),
  );

  assert.equal(state.kind, 'loaded');
  if (state.kind === 'loaded') {
    assert.equal(state.latestVisits.get(1)?.id, 'newer');
    assert.equal(state.latestVisits.has(2), false);
  }
});

test('derives the route point count from persisted route data', () => {
  assert.deepEqual(getRouteHomeSummary(createRoute(7)), { pointCount: 7 });
  assert.deepEqual(getRouteHomeSummary(createRoute(3)), { pointCount: 3 });
});
