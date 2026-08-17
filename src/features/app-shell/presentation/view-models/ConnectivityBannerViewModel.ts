import type { ConnectivityStatus } from '../../domain/ConnectivityService';
import type { StatusTone } from '@/shared/presentation/theme';

export interface ConnectivityBannerViewState {
  label: string;
  tone: StatusTone;
  visible: boolean;
}

const OFFLINE_LABEL = 'Offline — changes are saved on this device';

/**
 * Pure status-to-view mapping, kept separate from the component so it is
 * unit-testable without rendering React Native and so the banner's own
 * output is provably stable across repeated identical inputs.
 */
export function describeConnectivityBanner(status: ConnectivityStatus): ConnectivityBannerViewState {
  if (status === 'offline') {
    return { label: OFFLINE_LABEL, tone: 'danger', visible: true };
  }

  return { label: '', tone: 'neutral', visible: false };
}
