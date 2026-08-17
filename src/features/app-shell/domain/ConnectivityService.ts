export type ConnectivityStatus = 'online' | 'offline';

export type ConnectivityChangeListener = (status: ConnectivityStatus) => void;

/**
 * Isolated boundary for device connectivity. Presentation code depends only
 * on this contract; the concrete adapter (e.g. NetInfo-backed) is the single
 * replaceable seam, matching how `VisitSyncGateway` isolates synchronization.
 */
export interface ConnectivityService {
  getCurrentStatus(): ConnectivityStatus;
  subscribe(listener: ConnectivityChangeListener): () => void;
}
