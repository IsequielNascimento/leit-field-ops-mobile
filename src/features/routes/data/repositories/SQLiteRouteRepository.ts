import type { SQLiteDatabase } from 'expo-sqlite';

import type { RouteAggregate, RouteMetadata } from '../../domain/entities/Route';
import type { RoutePoint } from '../../domain/entities/RoutePoint';
import type { RouteRepository } from '../../domain/repositories/RouteRepository';

interface RouteRow {
  id: string;
  name: string;
  scheduled_date: string;
  city: string;
  state: string;
  neighborhood: string;
  status: string;
}

interface RoutePointRow {
  id: number;
  route_id: string;
  visit_order: number;
  installation_code: string;
  customer: string;
  reference_point: string;
  address: string;
  latitude: number;
  longitude: number;
  meter_number: string;
  previous_reading: number;
  status: string;
}

function routeMetadataFromRow(row: RouteRow): RouteMetadata {
  return {
    id: row.id,
    name: row.name,
    scheduledDate: row.scheduled_date,
    city: row.city,
    state: row.state,
    neighborhood: row.neighborhood,
    status: row.status,
  };
}

function routePointFromRow(row: RoutePointRow): RoutePoint {
  return {
    id: row.id,
    routeId: row.route_id,
    order: row.visit_order,
    installationCode: row.installation_code,
    customer: row.customer,
    referencePoint: row.reference_point,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    meterNumber: row.meter_number,
    previousReading: row.previous_reading,
    status: row.status,
  };
}

/**
 * SQLite-backed implementation of RouteRepository. Owns all SQL and row
 * mapping for the routes/route_points tables; callers only see domain
 * types through the RouteRepository contract.
 */
export class SQLiteRouteRepository implements RouteRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async saveRoute(route: RouteAggregate): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO routes (id, name, scheduled_date, city, state, neighborhood, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           scheduled_date = excluded.scheduled_date,
           city = excluded.city,
           state = excluded.state,
           neighborhood = excluded.neighborhood,
           status = excluded.status;`,
        [route.id, route.name, route.scheduledDate, route.city, route.state, route.neighborhood, route.status],
      );

      for (const point of route.points) {
        if (point.routeId !== route.id) {
          throw new Error(
            `Route point ${point.id} belongs to route ${point.routeId}, not aggregate route ${route.id}.`,
          );
        }

        await this.db.runAsync(
          `INSERT INTO route_points (
             id, route_id, visit_order, installation_code, customer, reference_point,
             address, latitude, longitude, meter_number, previous_reading, status
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             route_id = excluded.route_id,
             visit_order = excluded.visit_order,
             installation_code = excluded.installation_code,
             customer = excluded.customer,
             reference_point = excluded.reference_point,
             address = excluded.address,
             latitude = excluded.latitude,
             longitude = excluded.longitude,
             meter_number = excluded.meter_number,
             previous_reading = excluded.previous_reading,
             status = excluded.status;`,
          [
            point.id,
            point.routeId,
            point.order,
            point.installationCode,
            point.customer,
            point.referencePoint,
            point.address,
            point.latitude,
            point.longitude,
            point.meterNumber,
            point.previousReading,
            point.status,
          ],
        );
      }
    });
  }

  async getRouteById(routeId: string): Promise<RouteAggregate | null> {
    const routeRow = await this.db.getFirstAsync<RouteRow>('SELECT * FROM routes WHERE id = ?;', [routeId]);

    if (!routeRow) {
      return null;
    }

    const pointRows = await this.db.getAllAsync<RoutePointRow>(
      'SELECT * FROM route_points WHERE route_id = ? ORDER BY visit_order ASC;',
      [routeId],
    );

    return {
      ...routeMetadataFromRow(routeRow),
      points: pointRows.map(routePointFromRow),
    };
  }

  async getPointById(pointId: number): Promise<RoutePoint | null> {
    const row = await this.db.getFirstAsync<RoutePointRow>('SELECT * FROM route_points WHERE id = ?;', [pointId]);
    return row ? routePointFromRow(row) : null;
  }
}
