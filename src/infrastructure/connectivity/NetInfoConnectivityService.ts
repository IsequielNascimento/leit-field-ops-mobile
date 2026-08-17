import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import type {
  ConnectivityChangeListener,
  ConnectivityService,
  ConnectivityStatus,
} from '@/features/app-shell/domain/ConnectivityService';

/**
 * A `null`/`undefined` `isConnected` means the platform has not resolved a
 * state yet. Treating that as online avoids flashing a false offline banner
 * on cold start; only an explicit `false` is reported as offline.
 */
function toStatus(state: Pick<NetInfoState, 'isConnected'>): ConnectivityStatus {
  return state.isConnected === false ? 'offline' : 'online';
}

/**
 * The replaceable seam for connectivity detection. Wraps
 * `@react-native-community/netinfo` behind the `ConnectivityService`
 * contract so presentation code never depends on the concrete library.
 */
export class NetInfoConnectivityService implements ConnectivityService {
  private lastKnownStatus: ConnectivityStatus = 'online';

  constructor() {
    NetInfo.fetch()
      .then((state) => {
        this.lastKnownStatus = toStatus(state);
      })
      .catch(() => {
        this.lastKnownStatus = 'online';
      });
  }

  getCurrentStatus(): ConnectivityStatus {
    return this.lastKnownStatus;
  }

  subscribe(listener: ConnectivityChangeListener): () => void {
    return NetInfo.addEventListener((state) => {
      this.lastKnownStatus = toStatus(state);
      listener(this.lastKnownStatus);
    });
  }
}
