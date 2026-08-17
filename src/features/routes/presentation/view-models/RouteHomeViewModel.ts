import type { RouteAggregate } from '../../domain/entities/Route';
import type { RouteRepository } from '../../domain/repositories/RouteRepository';
import type { Visit } from '@/features/visits/domain/entities/Visit';
import type { VisitRepository } from '@/features/visits/domain/repositories/VisitRepository';
import { selectLatestVisit } from '@/features/visits/domain/use-cases/DeriveVisitDisplayStatus';

export const OFFICIAL_ROUTE_ID = 'LEIT-ALDEOTA-001';

export type RouteHomeState =
  | { kind: 'loading' }
  | { kind: 'loaded'; route: RouteAggregate; latestVisits: ReadonlyMap<number, Visit> }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

export interface RouteHomeSummary {
  pointCount: number;
}

/**
 * Loads the route-home state through the domain repository boundary,
 * including the visit already recorded for each point. The presentation
 * layer never reads the bundled JSON directly.
 */
export async function loadRouteHome(
  routeRepository: RouteRepository,
  visitRepository: VisitRepository,
  routeId = OFFICIAL_ROUTE_ID,
): Promise<RouteHomeState> {
  try {
    const route = await routeRepository.getRouteById(routeId);

    if (!route || route.points.length === 0) {
      return { kind: 'empty' };
    }

    const latestVisits = new Map<number, Visit>();

    await Promise.all(
      route.points.map(async (point) => {
        const latestVisit = selectLatestVisit(await visitRepository.getVisitsByPointId(point.id));

        if (latestVisit) {
          latestVisits.set(point.id, latestVisit);
        }
      }),
    );

    return { kind: 'loaded', route, latestVisits };
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
