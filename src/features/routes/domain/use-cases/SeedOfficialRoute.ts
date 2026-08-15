import type { RouteAggregate } from '../entities/Route';
import type { RouteRepository } from '../repositories/RouteRepository';

/**
 * Persists the supplied official aggregate only when the route is absent.
 * The returned value always comes from the repository, making local storage
 * the runtime source of truth after initialization.
 */
export class SeedOfficialRoute {
  constructor(
    private readonly routeRepository: RouteRepository,
    private readonly officialRoute: RouteAggregate,
  ) {}

  async execute(): Promise<RouteAggregate> {
    const existingRoute = await this.routeRepository.getRouteById(this.officialRoute.id);

    if (existingRoute) {
      return existingRoute;
    }

    await this.routeRepository.saveRoute(this.officialRoute);

    const persistedRoute = await this.routeRepository.getRouteById(this.officialRoute.id);
    if (!persistedRoute) {
      throw new Error(`Official route ${this.officialRoute.id} was not available after seeding.`);
    }

    return persistedRoute;
  }
}
