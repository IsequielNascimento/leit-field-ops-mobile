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

export type LocationFixOutcome =
  | { kind: 'fixed'; reading: LocationReading }
  | { kind: 'unavailable'; message: string }
  | { kind: 'failed'; message: string };

export type VisitLocationEvidenceResult =
  | { kind: 'captured'; reading: LocationReading }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'unavailable'; message: string }
  | { kind: 'failed'; message: string };

export interface LocationPermissionGateway {
  requestPermission(): Promise<LocationPermissionOutcome>;
}

export interface CurrentPositionProvider {
  readCurrentPosition(): Promise<LocationFixOutcome>;
}
