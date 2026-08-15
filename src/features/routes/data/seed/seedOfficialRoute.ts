import type { SQLiteDatabase } from 'expo-sqlite';

import { SeedOfficialRoute } from '../../domain/use-cases/SeedOfficialRoute';
import { SQLiteRouteRepository } from '../repositories/SQLiteRouteRepository';
import { getOfficialRoute } from './officialRouteSource';

/** Runs the official route seed against the application's durable database. */
export async function seedOfficialRoute(db: SQLiteDatabase): Promise<void> {
  const repository = new SQLiteRouteRepository(db);
  const seed = new SeedOfficialRoute(repository, getOfficialRoute());

  await seed.execute();
}
