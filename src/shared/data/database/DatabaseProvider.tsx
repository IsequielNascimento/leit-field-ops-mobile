import React from 'react';
import { SQLiteProvider } from 'expo-sqlite';

import { initializeDatabase } from './initializeDatabase';

export const DATABASE_NAME = 'leit_field_ops.db';

interface DatabaseProviderProps {
  children: React.ReactNode;
}

/**
 * Application-level wrapper around Expo's SQLiteProvider. Opens the single
 * durable application database and runs migrations before children mount,
 * so routed screens never observe a database that is still initializing.
 *
 * `onInit` must stay referentially stable: the provider treats it as an effect
 * dependency and closes the database when it changes. See `initializeDatabase`.
 */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase} useSuspense={false}>
      {children}
    </SQLiteProvider>
  );
}
