import type { RoutePoint } from '../../domain/entities/RoutePoint';
import type { RouteRepository } from '../../domain/repositories/RouteRepository';
import type { Visit } from '@/features/visits/domain/entities/Visit';
import type { VisitRepository } from '@/features/visits/domain/repositories/VisitRepository';
import { selectLatestVisit } from '@/features/visits/domain/use-cases/DeriveVisitDisplayStatus';

export type PointIdParameter = string | string[] | undefined;

export type PointDetailsState =
  | { kind: 'loading' }
  | { kind: 'loaded'; point: RoutePoint; latestVisit: Visit | null }
  | { kind: 'invalid' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

export function parsePointId(parameter: PointIdParameter): number | null {
  if (typeof parameter !== 'string' || !/^[1-9]\d*$/.test(parameter)) {
    return null;
  }

  const pointId = Number(parameter);
  return Number.isSafeInteger(pointId) ? pointId : null;
}

/**
 * Loads a point and any visit already recorded for it from local
 * persistence, using only its stable identifier.
 */
export async function loadPointDetails(
  routeRepository: RouteRepository,
  visitRepository: VisitRepository,
  parameter: PointIdParameter,
): Promise<PointDetailsState> {
  const pointId = parsePointId(parameter);

  if (pointId === null) {
    return { kind: 'invalid' };
  }

  try {
    const point = await routeRepository.getPointById(pointId);

    if (!point) {
      return { kind: 'empty' };
    }

    const visits = await visitRepository.getVisitsByPointId(pointId);
    return { kind: 'loaded', point, latestVisit: selectLatestVisit(visits) };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Unable to load the local point.',
    };
  }
}
