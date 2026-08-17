import * as Location from 'expo-location';

import type {
  CurrentPositionProvider,
  LocationFixOutcome,
  LocationPermissionGateway,
  LocationPermissionOutcome,
} from '../../domain/services/LocationEvidenceService';

const SERVICES_DISABLED = 'Location services are turned off on this device.';
const POSITION_FAILURE = 'The device could not provide the current location.';

/**
 * Converts the platform fix time into an ISO timestamp. The device timestamp is
 * preferred because it is the measured moment of the fix; the receive time is
 * used only when the platform omits it.
 */
function toCapturedAt(timestamp: number): string {
  const fixTime = Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(fixTime).toISOString();
}

export class ExpoLocationEvidenceService
  implements LocationPermissionGateway, CurrentPositionProvider
{
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
        return { kind: 'unavailable', message: SERVICES_DISABLED };
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.LocationAccuracy.Balanced,
      });

      return {
        kind: 'fixed',
        reading: {
          capturedAt: toCapturedAt(position.timestamp),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
      };
    } catch {
      return { kind: 'failed', message: POSITION_FAILURE };
    }
  }
}
