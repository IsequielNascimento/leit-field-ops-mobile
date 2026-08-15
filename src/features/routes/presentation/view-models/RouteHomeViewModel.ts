import type { RouteAggregate } from '../../domain/entities/Route';
import type { RouteRepository } from '../../domain/repositories/RouteRepository';

export const OFFICIAL_ROUTE_ID = 'LEIT-ALDEOTA-001';

export type RouteHomeState =
  | { kind: 'loading' }
  | { kind: 'loaded'; route: RouteAggregate }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

export interface RouteHomeSummary {
  pointCount: number;
}

/**
 * Loads the route-home state through the domain repository boundary. The
 * presentation layer never reads the bundled JSON directly.
 */
export async function loadRouteHome(
  routeRepository: RouteRepository,
  routeId = OFFICIAL_ROUTE_ID,
): Promise<RouteHomeState> {
  try {
    const route = await routeRepository.getRouteById(routeId);

    if (!route || route.points.length === 0) {
      return { kind: 'empty' };
    }

    return { kind: 'loaded', route };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Unable to load the local route.',
    };
  }
}

export function getRouteHomeSummary(route: RouteAggregate): RouteHomeSummary {
  return { pointCount: route.points.length };
}
