import type { RoutePoint } from '../../domain/entities/RoutePoint';
import type { RouteRepository } from '../../domain/repositories/RouteRepository';

export type PointIdParameter = string | string[] | undefined;

export type PointDetailsState =
  | { kind: 'loading' }
  | { kind: 'loaded'; point: RoutePoint }
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

/** Loads a point from local persistence using only its stable identifier. */
export async function loadPointDetails(
  routeRepository: RouteRepository,
  parameter: PointIdParameter,
): Promise<PointDetailsState> {
  const pointId = parsePointId(parameter);

  if (pointId === null) {
    return { kind: 'invalid' };
  }

  try {
    const point = await routeRepository.getPointById(pointId);
    return point ? { kind: 'loaded', point } : { kind: 'empty' };
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Unable to load the local point.',
    };
  }
}
