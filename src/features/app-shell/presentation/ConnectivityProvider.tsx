import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

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
  const serviceRef = useRef<ConnectivityService>(service ?? new NetInfoConnectivityService());
  const [status, setStatus] = useState<ConnectivityStatus>(() => serviceRef.current.getCurrentStatus());

  useEffect(() => {
    const unsubscribe = serviceRef.current.subscribe((nextStatus) => {
      setStatus((current) => (current === nextStatus ? current : nextStatus));
    });

    return unsubscribe;
  }, []);

  return <ConnectivityContext.Provider value={status}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivityStatus(): ConnectivityStatus {
  return useContext(ConnectivityContext);
}
