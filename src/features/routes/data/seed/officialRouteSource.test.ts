import assert from 'node:assert/strict';
import test from 'node:test';

import officialRouteJson from '../../../../../assets/data/rota_aldeota_mira.json';

import {
  getOfficialRoute,
  OFFICIAL_ROUTE_ID,
  OFFICIAL_ROUTE_POINT_COUNT,
  OFFICIAL_ROUTE_PROVENANCE,
} from './officialRouteSource';

test('maps all official route values without reordering or mutation', () => {
  const route = getOfficialRoute();

  assert.equal(route.id, OFFICIAL_ROUTE_ID);
  assert.equal(route.points.length, OFFICIAL_ROUTE_POINT_COUNT);
  assert.deepEqual(
    route.points.map(({ routeId, ...point }) => {
      assert.equal(routeId, OFFICIAL_ROUTE_ID);
      return point;
    }),
    officialRouteJson.points,
  );
  assert.deepEqual(
    {
      routeId: route.id,
      routeName: route.name,
      date: route.scheduledDate,
      city: route.city,
      state: route.state,
      neighborhood: route.neighborhood,
      status: route.status,
    },
    {
      routeId: officialRouteJson.routeId,
      routeName: officialRouteJson.routeName,
      date: officialRouteJson.date,
      city: officialRouteJson.city,
      state: officialRouteJson.state,
      neighborhood: officialRouteJson.neighborhood,
      status: officialRouteJson.status,
    },
  );
  assert.deepEqual(
    route.points.map((point) => point.order),
    [1, 2, 3, 4, 5, 6, 7],
  );
});

test('preserves both official route source names as provenance', () => {
  assert.deepEqual(OFFICIAL_ROUTE_PROVENANCE, {
    challengeDocumentName: 'rota_aldeota_LEIT.json',
    receivedAttachmentName: 'rota_aldeota_mira.json',
  });
});
