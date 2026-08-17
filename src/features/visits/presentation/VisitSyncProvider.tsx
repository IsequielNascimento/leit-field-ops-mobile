import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { useConnectivityStatus } from '@/features/app-shell/presentation/ConnectivityProvider';
import { SQLiteVisitRepository } from '../data/repositories/SQLiteVisitRepository';
import type { Visit, VisitSyncStatus } from '../domain/entities/Visit';
import type { VisitSyncProgressListener } from '../domain/use-cases/SynchronizePendingVisits';
import { VisitSyncRunner } from '../domain/use-cases/VisitSyncRunner';
import { registerBackgroundVisitSync } from '../infrastructure/background/backgroundVisitSync';
import { SimulatedVisitSyncGateway } from '../infrastructure/sync/SimulatedVisitSyncGateway';
import {
  applyVisitSyncTransition,
  EMPTY_VISIT_SYNC_SUMMARY,
  eligibleForSyncCount,
  loadVisitSyncSummary,
  runVisitSync,
  shouldTriggerReconnectSync,
  type VisitSyncState,
  type VisitSyncSummary,
} from './view-models/VisitSyncViewModel';

interface VisitSyncContextValue {
  refresh: () => Promise<void>;
  state: VisitSyncState;
  subscribeToVisitChanges: (listener: VisitSyncProgressListener) => () => void;
  summary: VisitSyncSummary;
  sync: () => void;
}

const VisitSyncContext = createContext<VisitSyncContextValue | null>(null);

interface VisitSyncProviderProps {
  children: React.ReactNode;
}

/**
 * Owns synchronization for the whole app: one repository, one gateway and one
 * `VisitSyncRunner`, so the manual action and the reconnect hook share a
 * single in-flight guard instead of each holding their own.
 *
 * The reconnect hook lives here rather than in a screen because the attempt
 * must not depend on which route happens to be mounted.
 */
export function VisitSyncProvider({ children }: VisitSyncProviderProps) {
  const database = useSQLiteContext();
  const connectivity = useConnectivityStatus();
  const connectivityRef = useRef(connectivity);
  const listenersRef = useRef(new Set<VisitSyncProgressListener>());

  const repository = useMemo(() => new SQLiteVisitRepository(database), [database]);
  const runner = useMemo(
    () =>
      new VisitSyncRunner(
        repository,
        // MARK: the probe reads the ref only when a run starts, never while rendering
        // eslint-disable-next-line react-hooks/refs
        new SimulatedVisitSyncGateway({
          canReachService: () => connectivityRef.current === 'online',
        }),
      ),
    [repository],
  );

  const [state, setState] = useState<VisitSyncState>({ kind: 'idle' });
  const [summary, setSummary] = useState<VisitSyncSummary>(EMPTY_VISIT_SYNC_SUMMARY);

  const refresh = useCallback(async () => {
    setSummary(await loadVisitSyncSummary(repository));
  }, [repository]);

  const subscribeToVisitChanges = useCallback((listener: VisitSyncProgressListener) => {
    const listeners = listenersRef.current;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const handleVisitChanged = useCallback((visit: Visit, previousStatus: VisitSyncStatus) => {
    setSummary((current) => applyVisitSyncTransition(current, previousStatus, visit.syncStatus));

    for (const listener of listenersRef.current) {
      listener(visit, previousStatus);
    }
  }, []);

  const synchronize = useCallback(async () => {
    if (runner.isRunning()) {
      return;
    }

    setState({ kind: 'syncing' });
    const result = await runVisitSync(runner, handleVisitChanged);

    if (result !== null) {
      setState(result);
    }

    await refresh();
  }, [handleVisitChanged, refresh, runner]);

  // MARK: first read of the persisted queue; the count comes from SQLite, not from render state
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // MARK: opportunistic only — the app is fully correct if this never registers or never runs
  useEffect(() => {
    void registerBackgroundVisitSync();
  }, []);

  useEffect(() => {
    const previous = connectivityRef.current;
    connectivityRef.current = connectivity;

    if (!shouldTriggerReconnectSync(previous, connectivity)) {
      return;
    }

    void (async () => {
      const pendingWork = await loadVisitSyncSummary(repository);

      if (eligibleForSyncCount(pendingWork) > 0) {
        await synchronize();
      }
    })();
  }, [connectivity, repository, synchronize]);

  const value = useMemo<VisitSyncContextValue>(
    () => ({
      refresh,
      state,
      subscribeToVisitChanges,
      summary,
      sync: () => {
        void synchronize();
      },
    }),
    [refresh, state, subscribeToVisitChanges, summary, synchronize],
  );

  return <VisitSyncContext.Provider value={value}>{children}</VisitSyncContext.Provider>;
}

export function useVisitSync(): VisitSyncContextValue {
  const value = useContext(VisitSyncContext);

  if (value === null) {
    throw new Error('useVisitSync must be used inside a VisitSyncProvider.');
  }

  return value;
}
