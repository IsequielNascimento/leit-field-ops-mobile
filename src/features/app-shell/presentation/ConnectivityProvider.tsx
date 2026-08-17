import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { ConnectivityService, ConnectivityStatus } from '../domain/ConnectivityService';
import { NetInfoConnectivityService } from '@/infrastructure/connectivity/NetInfoConnectivityService';

const ConnectivityContext = createContext<ConnectivityStatus>('online');

interface ConnectivityProviderProps {
  children: React.ReactNode;
  service?: ConnectivityService;
}

/**
 * Owns the single connectivity subscription for the whole app tree. Screens
 * never subscribe individually; they read the shared status through
 * `useConnectivityStatus`. State updates are skipped when the incoming
 * status matches the current one, so repeated identical native events never
 * trigger extra renders.
 */
export function ConnectivityProvider({ children, service }: ConnectivityProviderProps) {
  const connectivityService = useMemo<ConnectivityService>(
    () => service ?? new NetInfoConnectivityService(),
    [service],
  );
  const [status, setStatus] = useState<ConnectivityStatus>(() =>
    connectivityService.getCurrentStatus(),
  );

  useEffect(() => {
    const unsubscribe = connectivityService.subscribe((nextStatus) => {
      setStatus((current) => (current === nextStatus ? current : nextStatus));
    });

    return unsubscribe;
  }, [connectivityService]);

  return <ConnectivityContext.Provider value={status}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivityStatus(): ConnectivityStatus {
  return useContext(ConnectivityContext);
}
