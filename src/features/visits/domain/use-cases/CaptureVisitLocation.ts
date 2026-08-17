import type {
  CurrentPositionProvider,
  LocationPermissionGateway,
  LocationReading,
  VisitLocationEvidenceResult,
} from '../services/LocationEvidenceService';

const PERMISSION_FAILURE = 'Location permission could not be checked.';
const POSITION_FAILURE = 'The device could not provide the current location.';
const INVALID_READING = 'The device returned an unusable location reading.';

function isUsableReading(reading: LocationReading): boolean {
  const { capturedAt, latitude, longitude } = reading;

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    capturedAt.trim().length > 0 &&
    Number.isFinite(Date.parse(capturedAt))
  );
}

/**
 * Turns a permission check and a single position read into visit location
 * evidence. A reading is reported as captured only when the device supplied
 * usable coordinates and a capture time; nothing is substituted on failure.
 */
export async function captureVisitLocation(
  permissions: LocationPermissionGateway,
  positions: CurrentPositionProvider,
): Promise<VisitLocationEvidenceResult> {
  let permission;

  try {
    permission = await permissions.requestPermission();
  } catch {
    return { kind: 'failed', message: PERMISSION_FAILURE };
  }

  if (permission.kind === 'denied') {
    return { kind: 'denied', canAskAgain: permission.canAskAgain };
  }

  if (permission.kind === 'failed') {
    return { kind: 'failed', message: permission.message };
  }

  let fix;

  try {
    fix = await positions.readCurrentPosition();
  } catch {
    return { kind: 'failed', message: POSITION_FAILURE };
  }

  if (fix.kind !== 'fixed') {
    return fix;
  }

  if (!isUsableReading(fix.reading)) {
    return { kind: 'failed', message: INVALID_READING };
  }

  return { kind: 'captured', reading: fix.reading };
}
