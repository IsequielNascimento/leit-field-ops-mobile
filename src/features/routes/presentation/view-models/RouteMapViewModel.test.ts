import assert from 'node:assert/strict';
import test from 'node:test';

import { getOfficialRoute, OFFICIAL_ROUTE_POINT_COUNT } from '../../data/seed/officialRouteSource';
import type { RoutePoint } from '../../domain/entities/RoutePoint';
import {
  buildRouteMapView,
  MAX_ZOOM,
  MIN_ZOOM,
  SINGLE_POINT_ZOOM,
  TILE_SIZE,
} from './RouteMapViewModel';

const VIEWPORT = { width: 360, height: 220, padding: 24 };

function officialPoints(): readonly RoutePoint[] {
  return getOfficialRoute().points;
}

function pointAt(latitude: number, longitude: number, order = 1): RoutePoint {
  return {
    id: order,
    routeId: 'LEIT-ALDEOTA-001',
    order,
    installationCode: `INSTALL-${order}`,
    customer: `Customer ${order}`,
    referencePoint: `Reference ${order}`,
    address: `Address ${order}`,
    latitude,
    longitude,
    meterNumber: `METER-${order}`,
    previousReading: 0,
    status: 'pending',
  };
}

test('derives one labelled marker per official route point, in visit order', () => {
  const view = buildRouteMapView(officialPoints(), VIEWPORT);

  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') {
    return;
  }

  assert.equal(view.markers.length, OFFICIAL_ROUTE_POINT_COUNT);
  assert.deepEqual(view.markers.map((marker) => marker.order), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(
    view.markers.map((marker) => marker.installationCode),
    officialPoints().map((point) => point.installationCode),
  );
  assert.deepEqual(
    view.markers.map((marker) => marker.pointId),
    officialPoints().map((point) => point.id),
  );
});

test('places markers at positions that preserve the official geography', () => {
  const points = officialPoints();
  const view = buildRouteMapView(points, VIEWPORT);

  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') {
    return;
  }

  const byOrder = new Map(view.markers.map((marker) => [marker.order, marker]));
  const westmost = points.reduce((a, b) => (a.longitude <= b.longitude ? a : b));
  const eastmost = points.reduce((a, b) => (a.longitude >= b.longitude ? a : b));
  const northmost = points.reduce((a, b) => (a.latitude >= b.latitude ? a : b));
  const southmost = points.reduce((a, b) => (a.latitude <= b.latitude ? a : b));

  const xs = view.markers.map((marker) => marker.x);
  const ys = view.markers.map((marker) => marker.y);

  assert.equal(byOrder.get(westmost.order)?.x, Math.min(...xs));
  assert.equal(byOrder.get(eastmost.order)?.x, Math.max(...xs));
  assert.equal(byOrder.get(northmost.order)?.y, Math.min(...ys));
  assert.equal(byOrder.get(southmost.order)?.y, Math.max(...ys));

  const distinctPositions = new Set(view.markers.map((marker) => `${marker.x}:${marker.y}`));
  assert.equal(distinctPositions.size, OFFICIAL_ROUTE_POINT_COUNT);
});

test('fits every official marker inside the padded viewport', () => {
  const view = buildRouteMapView(officialPoints(), VIEWPORT);

  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') {
    return;
  }

  for (const marker of view.markers) {
    assert.ok(
      marker.x >= VIEWPORT.padding && marker.x <= VIEWPORT.width - VIEWPORT.padding,
      `marker ${marker.order} x ${marker.x} escaped the viewport`,
    );
    assert.ok(
      marker.y >= VIEWPORT.padding && marker.y <= VIEWPORT.height - VIEWPORT.padding,
      `marker ${marker.order} y ${marker.y} escaped the viewport`,
    );
  }

  assert.ok(view.zoom >= MIN_ZOOM && view.zoom <= MAX_ZOOM);
});

test('requests only in-range keyless basemap tiles that cover the viewport', () => {
  const view = buildRouteMapView(officialPoints(), VIEWPORT);

  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') {
    return;
  }

  assert.ok(view.tiles.length > 0);

  const tileCount = 2 ** view.zoom;

  for (const tile of view.tiles) {
    const match = /^https:\/\/basemaps\.cartocdn\.com\/light_all\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(tile.url);
    assert.ok(match, `unexpected tile url ${tile.url}`);
    assert.ok(!/key|token|apikey/i.test(tile.url), 'tile url must not carry a credential');

    const [, zoom, column, row] = match;
    assert.equal(Number(zoom), view.zoom);
    assert.ok(Number(column) >= 0 && Number(column) < tileCount);
    assert.ok(Number(row) >= 0 && Number(row) < tileCount);

    assert.ok(tile.left + TILE_SIZE > 0 && tile.left < VIEWPORT.width);
    assert.ok(tile.top + TILE_SIZE > 0 && tile.top < VIEWPORT.height);
  }

  const covered = view.tiles.some((tile) => tile.left <= 0 && tile.left + TILE_SIZE >= 0);
  assert.ok(covered, 'no tile covers the left edge of the viewport');
});

test('reports the map as unavailable instead of guessing a viewport or a position', () => {
  const points = officialPoints();

  assert.equal(buildRouteMapView(points, { ...VIEWPORT, width: 0 }).kind, 'unavailable');
  assert.equal(buildRouteMapView(points, { ...VIEWPORT, height: 0 }).kind, 'unavailable');
  assert.equal(buildRouteMapView([], VIEWPORT).kind, 'unavailable');
  assert.equal(
    buildRouteMapView([pointAt(Number.NaN, Number.NaN)], VIEWPORT).kind,
    'unavailable',
  );
});

test('drops points whose stored coordinates cannot be projected', () => {
  const view = buildRouteMapView(
    [pointAt(-3.7288989, -38.5164303, 1), pointAt(999, -38.51, 2), pointAt(-3.739, -38.5077433, 3)],
    VIEWPORT,
  );

  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') {
    return;
  }

  assert.deepEqual(view.markers.map((marker) => marker.order), [1, 3]);
});

test('centres a single located point at a readable street-level zoom', () => {
  const view = buildRouteMapView([pointAt(-3.7288989, -38.5164303)], VIEWPORT);

  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') {
    return;
  }

  assert.equal(view.zoom, SINGLE_POINT_ZOOM);
  assert.ok(Math.abs(view.markers[0].x - VIEWPORT.width / 2) < 1e-6);
  assert.ok(Math.abs(view.markers[0].y - VIEWPORT.height / 2) < 1e-6);
});
