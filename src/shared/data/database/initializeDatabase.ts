import type { SQLiteDatabase } from 'expo-sqlite';

import { seedOfficialRoute } from '@/features/routes/data/seed/seedOfficialRoute';
import { runMigrations } from './migrations';

/**
 * Declared at module level so its identity never changes.
 *
 * `SQLiteProvider` keeps `onInit` in its effect dependency list and closes the
 * database in the effect cleanup. An inline arrow function is a new reference on
 * every render, so the provider would close and reopen the database on each
 * re-render of the tree. The teardown of the old effect and the setup of the new
 * one then race over the same native handle, and the app can end up holding a
 * database that has already been closed, which surfaces as
 * `NativeDatabase.prepareAsync` rejecting with a NullPointerException on every
 * query until the process restarts.
 */
export async function initializeDatabase(database: SQLiteDatabase): Promise<void> {
  await runMigrations(database);
  await seedOfficialRoute(database);
}
