import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Test-only driver that satisfies the slice of the `SQLiteDatabase` surface the
 * repositories and migrations actually use, backed by the SQLite engine bundled
 * with Node. It exists so schema, migration and repository behaviour can be
 * proven against real SQL — constraints, transactions and all — without a
 * device, an emulator or any network access. Production code never imports it.
 */
export interface InMemoryTestDatabase {
  close: () => void;
  db: SQLiteDatabase;
}

// MARK: node:sqlite returns null-prototype rows; expo-sqlite returns plain objects
function toPlainObject(row: unknown): Record<string, unknown> {
  return { ...(row as Record<string, unknown>) };
}

export function createInMemoryTestDatabase(): InMemoryTestDatabase {
  const sqlite = new DatabaseSync(':memory:');

  const db = {
    async execAsync(source: string): Promise<void> {
      sqlite.exec(source);
    },

    async runAsync(source: string, params: unknown[] = []): Promise<unknown> {
      return sqlite.prepare(source).run(...(params as never[]));
    },

    async getFirstAsync<T>(source: string, params: unknown[] = []): Promise<T | null> {
      const row = sqlite.prepare(source).get(...(params as never[]));
      return row === undefined ? null : (toPlainObject(row) as T);
    },

    async getAllAsync<T>(source: string, params: unknown[] = []): Promise<T[]> {
      return sqlite.prepare(source).all(...(params as never[])).map(toPlainObject) as T[];
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      sqlite.exec('BEGIN;');

      try {
        await task();
        sqlite.exec('COMMIT;');
      } catch (error) {
        sqlite.exec('ROLLBACK;');
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;

  return { close: () => sqlite.close(), db };
}
