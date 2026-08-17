import * as Location from 'expo-location';

import { resolveWithin } from '@/shared/async/resolveWithin';
import type {
  CurrentPositionProvider,
  LocationFixOutcome,
  LocationPermissionGateway,
  LocationPermissionOutcome,
  LocationServicesActivator,
} from '../../domain/services/LocationEvidenceService';

const SERVICES_DISABLED = 'Location services are turned off on this device.';
const POSITION_FAILURE = 'The device could not provide the current location.';
const NO_FIX =
  'The device could not get a location fix. Move to an open area, or step outside, and try again.';

/**
 * Offline is exactly when this is hardest: with no network the device loses
 * assisted positioning and has to wait on raw GNSS, which indoors can take
 * minutes or never arrive. Without a budget the request hangs, the button stays
 * busy and the visit can never be completed.
 */
const FRESH_FIX_TIMEOUT_MS = 15_000;

/**
 * How stale a cached fix may be and still describe where this visit happened.
 */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1_000;

/**
 * Converts the platform fix time into an ISO timestamp. The device timestamp is
 * preferred because it is the measured moment of the fix; the receive time is
 * used only when the platform omits it.
 */
function toCapturedAt(timestamp: number): string {
  const fixTime = Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(fixTime).toISOString();
}

function toFixOutcome(position: Location.LocationObject): LocationFixOutcome {
  return {
    kind: 'fixed',
    reading: {
      capturedAt: toCapturedAt(position.timestamp),
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
  };
}

export class ExpoLocationEvidenceService
  implements LocationPermissionGateway, CurrentPositionProvider, LocationServicesActivator
{
  /**
   * On Android this raises the system dialog that turns location services back
   * on without leaving the app. The returned value is the state afterwards, so
   * a refusal leaves the screen showing the same recoverable card.
   */
  async promptToEnableServices(): Promise<boolean> {
    try {
      await Location.enableNetworkProviderAsync();
      return await Location.hasServicesEnabledAsync();
    } catch {
      return false;
    }
  }

  async requestPermission(): Promise<LocationPermissionOutcome> {
    try {
      const current = await Location.getForegroundPermissionsAsync();

      if (current.granted) {
        return { kind: 'granted' };
      }

      if (!current.canAskAgain) {
        return { kind: 'denied', canAskAgain: false };
      }

      const requested = await Location.requestForegroundPermissionsAsync();
      return requested.granted
        ? { kind: 'granted' }
        : { kind: 'denied', canAskAgain: requested.canAskAgain };
    } catch {
      return { kind: 'failed', message: 'Location permission could not be checked.' };
    }
  }

  async readCurrentPosition(): Promise<LocationFixOutcome> {
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        return { kind: 'unavailable', message: SERVICES_DISABLED, reason: 'services-disabled' };
      }

      const fresh = await resolveWithin(
        Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Balanced }),
        FRESH_FIX_TIMEOUT_MS,
      );

      if (fresh) {
        return toFixOutcome(fresh);
      }

      // MARK: the cached fix is the difference between a completable visit and
      // a blocked one when the fresh fix never arrives
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
      });

      if (lastKnown) {
        return toFixOutcome(lastKnown);
      }

      return { kind: 'unavailable', message: NO_FIX, reason: 'no-fix' };
    } catch {
      return { kind: 'failed', message: POSITION_FAILURE };
    }
  }
}
