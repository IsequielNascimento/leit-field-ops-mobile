import React from 'react';
import { SQLiteProvider } from 'expo-sqlite';

import { runMigrations } from './migrations';

export const DATABASE_NAME = 'leit_field_ops.db';

interface DatabaseProviderProps {
  children: React.ReactNode;
}

/**
 * Application-level wrapper around Expo's SQLiteProvider. Opens the single
 * durable application database and runs migrations before children mount,
 * so routed screens never observe a database that is still initializing.
 */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={runMigrations} useSuspense={false}>
      {children}
    </SQLiteProvider>
  );
}
