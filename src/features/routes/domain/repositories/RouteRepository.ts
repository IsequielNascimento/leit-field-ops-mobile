import type { RouteAggregate } from '../entities/Route';
import type { RoutePoint } from '../entities/RoutePoint';

/**
 * Persistence boundary for route metadata and route points. Implementations
 * own storage details; callers depend only on this contract.
 */
export interface RouteRepository {
  /**
   * Persists a route and its points as a single atomic aggregate write.
   * Upserts route metadata and the supplied points without deleting
   * unrelated route/point rows.
   */
  saveRoute(route: RouteAggregate): Promise<void>;

  /**
   * Retrieves a route and its points ordered by their persisted visit
   * order, or `null` when no route exists for the given id.
   */
  getRouteById(routeId: string): Promise<RouteAggregate | null>;

  /**
   * Retrieves a single route point by its stable identifier, or `null`
   * when no point exists for the given id.
   */
  getPointById(pointId: number): Promise<RoutePoint | null>;
}
