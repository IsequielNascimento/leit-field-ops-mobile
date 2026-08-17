export type LocationPermissionOutcome =
  | { kind: 'granted' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'failed'; message: string };

/**
 * A location measured by the device. Every field is read from the platform,
 * never defaulted or invented when the device fails to provide it.
 */
export interface LocationReading {
  latitude: number;
  longitude: number;
  capturedAt: string;
}

/**
 * Why no coordinates came back. The two cases need different offers from the
 * interface: a disabled location service is fixed with a system toggle, while a
 * missing fix is fixed by moving somewhere with sky visibility.
 */
export type LocationUnavailableReason = 'services-disabled' | 'no-fix';

export type LocationFixOutcome =
  | { kind: 'fixed'; reading: LocationReading }
  | { kind: 'unavailable'; message: string; reason: LocationUnavailableReason }
  | { kind: 'failed'; message: string };

export type VisitLocationEvidenceResult =
  | { kind: 'captured'; reading: LocationReading }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'unavailable'; message: string; reason: LocationUnavailableReason }
  | { kind: 'failed'; message: string };

export interface LocationPermissionGateway {
  requestPermission(): Promise<LocationPermissionOutcome>;
}

export interface CurrentPositionProvider {
  readCurrentPosition(): Promise<LocationFixOutcome>;
}

/**
 * Asks the platform to turn location services back on. Returns whether they are
 * enabled afterwards, so the caller can retry instead of guessing.
 */
export interface LocationServicesActivator {
  promptToEnableServices(): Promise<boolean>;
}
