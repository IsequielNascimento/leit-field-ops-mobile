/**
 * A single service point belonging to a route, as delivered by the official
 * route JSON. Field names mirror the official JSON shape.
 */
export interface RoutePoint {
  id: number;
  routeId: string;
  order: number;
  installationCode: string;
  customer: string;
  referencePoint: string;
  address: string;
  latitude: number;
  longitude: number;
  meterNumber: string;
  previousReading: number;
  status: string;
}
