import * as BackgroundTask from 'expo-background-task';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { DATABASE_NAME, runMigrations } from '@/shared/data/database';
import { SQLiteVisitRepository } from '../../data/repositories/SQLiteVisitRepository';
import { describeBackgroundSyncOutcome } from '../../domain/use-cases/BackgroundVisitSync';
import { VisitSyncRunner } from '../../domain/use-cases/VisitSyncRunner';
import { SimulatedVisitSyncGateway } from '../sync/SimulatedVisitSyncGateway';

export const BACKGROUND_VISIT_SYNC_TASK = 'leit-background-visit-sync';

/** Android's scheduler treats this as the floor of a window, never a promise. */
const MINIMUM_INTERVAL_MINUTES = 15;

/**
 * Runs the same synchronization use case the interface uses, from the
 * background context. The only thing that differs is where the database
 * handle comes from: the background process has no React tree, so it opens
 * the application database itself. Migrations are idempotent, so opening it
 * here can never rebuild or lose data.
 *
 * Nothing in the mandatory flow depends on this ever running.
 */
async function synchronizeInBackground(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await runMigrations(database);

    const runner = new VisitSyncRunner(
      new SQLiteVisitRepository(database),
      new SimulatedVisitSyncGateway(),
    );

    const outcome = describeBackgroundSyncOutcome(await runner.run());

    return outcome === 'failed'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

TaskManager.defineTask(BACKGROUND_VISIT_SYNC_TASK, synchronizeInBackground);

/**
 * Registration is best effort. A device that restricts background work, or a
 * platform where the API is unavailable, simply leaves the app relying on the
 * manual action and the reconnect attempt, which is the supported behaviour.
 */
export async function registerBackgroundVisitSync(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();

    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      return false;
    }

    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_VISIT_SYNC_TASK)) {
      return true;
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_VISIT_SYNC_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });

    return true;
  } catch {
    return false;
  }
}
