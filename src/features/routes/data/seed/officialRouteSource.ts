import officialRouteJson from '../../../../../assets/data/rota_aldeota_mira.json';

import type { RouteAggregate } from '../../domain/entities/Route';
import type { RoutePoint } from '../../domain/entities/RoutePoint';

export const OFFICIAL_ROUTE_ID = 'LEIT-ALDEOTA-001';
export const OFFICIAL_ROUTE_POINT_COUNT = 7;

export const OFFICIAL_ROUTE_PROVENANCE = Object.freeze({
  challengeDocumentName: 'rota_aldeota_LEIT.json',
  receivedAttachmentName: 'rota_aldeota_mira.json',
});

type RawOfficialRoutePoint = Omit<RoutePoint, 'routeId'>;

interface RawOfficialRoute {
  routeId: string;
  routeName: string;
  date: string;
  city: string;
  state: string;
  neighborhood: string;
  status: string;
  points: RawOfficialRoutePoint[];
}

const REQUIRED_ROUTE_STRING_FIELDS = [
  'routeId',
  'routeName',
  'date',
  'city',
  'state',
  'neighborhood',
  'status',
] as const;

const REQUIRED_POINT_STRING_FIELDS = [
  'installationCode',
  'customer',
  'referencePoint',
  'address',
  'meterNumber',
  'status',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateOfficialRoute(payload: unknown): asserts payload is RawOfficialRoute {
  if (!isRecord(payload)) {
    throw new Error('The bundled official route must be a JSON object.');
  }

  for (const field of REQUIRED_ROUTE_STRING_FIELDS) {
    if (typeof payload[field] !== 'string' || payload[field].length === 0) {
      throw new Error(`The bundled official route has an invalid ${field}.`);
    }
  }

  if (payload.routeId !== OFFICIAL_ROUTE_ID) {
    throw new Error(`Expected official route ${OFFICIAL_ROUTE_ID}, received ${payload.routeId}.`);
  }

  if (!Array.isArray(payload.points) || payload.points.length !== OFFICIAL_ROUTE_POINT_COUNT) {
    throw new Error(`The official route must contain exactly ${OFFICIAL_ROUTE_POINT_COUNT} points.`);
  }

  const pointIds = new Set<number>();

  payload.points.forEach((point, index) => {
    if (!isRecord(point)) {
      throw new Error(`Official route point at index ${index} must be a JSON object.`);
    }

    const expectedOrder = index + 1;
    if (point.order !== expectedOrder) {
      throw new Error(`Official route point at index ${index} must have order ${expectedOrder}.`);
    }

    for (const field of ['id', 'order', 'latitude', 'longitude', 'previousReading'] as const) {
      if (typeof point[field] !== 'number' || !Number.isFinite(point[field])) {
        throw new Error(`Official route point ${expectedOrder} has an invalid ${field}.`);
      }
    }

    for (const field of REQUIRED_POINT_STRING_FIELDS) {
      if (typeof point[field] !== 'string' || point[field].length === 0) {
        throw new Error(`Official route point ${expectedOrder} has an invalid ${field}.`);
      }
    }

    const pointId = point.id;
    if (typeof pointId !== 'number' || !Number.isInteger(pointId) || pointIds.has(pointId)) {
      throw new Error(`Official route point ${expectedOrder} has a duplicate or invalid id.`);
    }

    pointIds.add(pointId);
  });
}

/**
 * Validates and maps the immutable bundled attachment into the route domain.
 * The JSON remains an initialization input only; runtime consumers read the
 * resulting aggregate back through RouteRepository.
 */
export function getOfficialRoute(): RouteAggregate {
  const payload: unknown = officialRouteJson;
  validateOfficialRoute(payload);

  return {
    id: payload.routeId,
    name: payload.routeName,
    scheduledDate: payload.date,
    city: payload.city,
    state: payload.state,
    neighborhood: payload.neighborhood,
    status: payload.status,
    points: payload.points.map((point) => ({
      ...point,
      routeId: payload.routeId,
    })),
  };
}
