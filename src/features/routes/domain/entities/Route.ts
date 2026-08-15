import type { RoutePoint } from './RoutePoint';

/**
 * Route metadata as delivered by the official route JSON.
 */
export interface RouteMetadata {
  id: string;
  name: string;
  scheduledDate: string;
  city: string;
  state: string;
  neighborhood: string;
  status: string;
}

/**
 * A route together with its ordered service points, as persisted and
 * retrieved as a single aggregate.
 */
export interface RouteAggregate extends RouteMetadata {
  points: RoutePoint[];
}
