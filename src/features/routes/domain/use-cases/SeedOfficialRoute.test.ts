import assert from 'node:assert/strict';
import test from 'node:test';

import type { RouteAggregate } from '../entities/Route';
import type { RoutePoint } from '../entities/RoutePoint';
import type { RouteRepository } from '../repositories/RouteRepository';
import { SeedOfficialRoute } from './SeedOfficialRoute';

const officialRoute: RouteAggregate = {
  id: 'LEIT-ALDEOTA-001',
  name: 'Official route',
  scheduledDate: '2026-08-20',
  city: 'Fortaleza',
  state: 'CE',
  neighborhood: 'Aldeota',
  status: 'assigned',
  points: Array.from({ length: 7 }, (_, index) => ({
    id: 101 + index,
    routeId: 'LEIT-ALDEOTA-001',
    order: index + 1,
    installationCode: `LEIT-ALD-000${index + 1}`,
    customer: `Residence ${index + 1}`,
    referencePoint: `Reference ${index + 1}`,
    address: `Address ${index + 1}`,
    latitude: -3.72 - index / 100,
    longitude: -38.5 - index / 100,
    meterNumber: `MED-1000${index + 1}`,
    previousReading: 1000 + index,
    status: 'pending',
  })),
};

class InMemoryRouteRepository implements RouteRepository {
  route: RouteAggregate | null = null;
  saveCount = 0;
  failOnSave = false;

  async saveRoute(route: RouteAggregate): Promise<void> {
    this.saveCount += 1;
    if (this.failOnSave) {
      throw new Error('Persistence failed');
    }

    this.route = structuredClone(route);
  }

  async getRouteById(routeId: string): Promise<RouteAggregate | null> {
    return this.route?.id === routeId ? structuredClone(this.route) : null;
  }

  async getPointById(pointId: number): Promise<RoutePoint | null> {
    return structuredClone(this.route?.points.find((point) => point.id === pointId) ?? null);
  }
}

test('seeds once and returns the persisted aggregate on repeated execution', async () => {
  const repository = new InMemoryRouteRepository();
  const seed = new SeedOfficialRoute(repository, officialRoute);

  const firstResult = await seed.execute();
  const secondResult = await seed.execute();

  assert.equal(repository.saveCount, 1);
  assert.equal(firstResult.id, officialRoute.id);
  assert.equal(secondResult.id, officialRoute.id);
  assert.equal(secondResult.points.length, 7);
  assert.deepEqual(secondResult, repository.route);
});

test('does not write when the route already exists', async () => {
  const repository = new InMemoryRouteRepository();
  repository.route = structuredClone(officialRoute);

  const result = await new SeedOfficialRoute(repository, {
    ...officialRoute,
    name: 'Bundled value that must not replace local storage',
  }).execute();

  assert.equal(repository.saveCount, 0);
  assert.equal(result.name, officialRoute.name);
});

test('propagates persistence failures without returning bundled data', async () => {
  const repository = new InMemoryRouteRepository();
  repository.failOnSave = true;

  await assert.rejects(
    new SeedOfficialRoute(repository, officialRoute).execute(),
    /Persistence failed/,
  );
  assert.equal(repository.route, null);
});
