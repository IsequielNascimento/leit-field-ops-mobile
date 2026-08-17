import type {
  CameraCaptureOutcome,
  CameraPermissionGateway,
  DurablePhotoStorage,
} from '../../domain/services/CameraEvidenceService';
import type { VisitPhotoProcessor } from '../../domain/services/ImageProcessingService';
import type {
  CurrentPositionProvider,
  LocationPermissionGateway,
  LocationReading,
} from '../../domain/services/LocationEvidenceService';
import { captureVisitLocation } from '../../domain/use-cases/CaptureVisitLocation';
import { completeVisit } from '../../domain/use-cases/CompleteVisit';
import { prepareVisitPhoto } from '../../domain/use-cases/PrepareVisitPhoto';
import { validateCurrentReading } from '../../domain/validation/validateCurrentReading';
import type { VisitRepository } from '../../domain/repositories/VisitRepository';
import type { RouteRepository } from '@/features/routes/domain/repositories/RouteRepository';

const POINT_LOOKUP_FAILURE = 'The point could not be read from this device.';
const POINT_MISSING = 'This point is no longer available in local storage.';

export type VisitEvidenceParameter = string | string[] | undefined;

export interface VisitEvidenceContext {
  currentReading: number;
  pointId: number;
}

export type VisitEvidenceState =
  | { kind: 'ready'; notice?: string }
  | { kind: 'requesting-permission' }
  | { kind: 'camera' }
  | { kind: 'saving' }
  | { kind: 'captured'; photoUri: string }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'error'; message: string };

export type VisitLocationState =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'captured'; reading: LocationReading }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'services-disabled'; message: string }
  | { kind: 'error'; message: string };

export type VisitCompletionState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export function parseVisitEvidenceContext(
  pointIdParameter: VisitEvidenceParameter,
  readingParameter: VisitEvidenceParameter,
): VisitEvidenceContext | null {
  if (
    typeof pointIdParameter !== 'string' ||
    !/^[1-9]\d*$/.test(pointIdParameter) ||
    typeof readingParameter !== 'string'
  ) {
    return null;
  }

  const pointId = Number(pointIdParameter);
  const reading = validateCurrentReading(readingParameter);

  if (!Number.isSafeInteger(pointId) || reading.kind !== 'valid') {
    return null;
  }

  return { currentReading: reading.value, pointId };
}

export async function requestCamera(
  gateway: CameraPermissionGateway,
): Promise<VisitEvidenceState> {
  const permission = await gateway.requestPermission();

  switch (permission.kind) {
    case 'granted':
      return { kind: 'camera' };
    case 'denied':
      return { kind: 'denied', canAskAgain: permission.canAskAgain };
    case 'failed':
      return { kind: 'error', message: permission.message };
  }
}

export async function handleCameraOutcome(
  processor: VisitPhotoProcessor,
  storage: DurablePhotoStorage,
  outcome: CameraCaptureOutcome,
): Promise<VisitEvidenceState> {
  const result = await prepareVisitPhoto(processor, storage, outcome);

  switch (result.kind) {
    case 'captured':
      return { kind: 'captured', photoUri: result.photoUri };
    case 'cancelled':
      return { kind: 'ready', notice: 'Photo capture cancelled.' };
    case 'denied':
      return { kind: 'denied', canAskAgain: result.canAskAgain };
    case 'failed':
      return { kind: 'error', message: result.message };
  }
}

export function resetEvidenceState(): VisitEvidenceState {
  return { kind: 'ready' };
}

export async function requestVisitLocation(
  permissions: LocationPermissionGateway,
  positions: CurrentPositionProvider,
): Promise<VisitLocationState> {
  const result = await captureVisitLocation(permissions, positions);

  switch (result.kind) {
    case 'captured':
      return { kind: 'captured', reading: result.reading };
    case 'denied':
      return { kind: 'denied', canAskAgain: result.canAskAgain };
    case 'unavailable':
      // MARK: a disabled service is recoverable with a system toggle, so it
      // gets its own state instead of the generic error card with a dead retry
      return result.reason === 'services-disabled'
        ? { kind: 'services-disabled', message: result.message }
        : { kind: 'error', message: result.message };
    case 'failed':
      return { kind: 'error', message: result.message };
  }
}

export function resetLocationState(): VisitLocationState {
  return { kind: 'idle' };
}

/**
 * Names what is still missing, so a disabled action always says why. A generic
 * "capture the photo and the location" reads as a dead end once one of the two
 * is already done.
 */
export function describeMissingEvidence(
  photo: VisitEvidenceState,
  location: VisitLocationState,
): string | null {
  const missingPhoto = photo.kind !== 'captured';
  const missingLocation = location.kind !== 'captured';

  if (missingPhoto && missingLocation) {
    return 'Capture the meter photo and record the current location to complete this visit.';
  }

  if (missingPhoto) {
    return 'Capture the meter photo to complete this visit.';
  }

  if (missingLocation) {
    return 'Record the current location to complete this visit.';
  }

  return null;
}

/**
 * Finishes the visit offline. The point is re-read from local storage so the
 * saved record carries the persisted installation, meter and previous reading
 * rather than values carried through navigation.
 */
export async function submitCompletedVisit(
  routeRepository: RouteRepository,
  visitRepository: VisitRepository,
  context: VisitEvidenceContext,
  photoUri: string,
  location: LocationReading,
): Promise<VisitCompletionState> {
  let point;

  try {
    point = await routeRepository.getPointById(context.pointId);
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : POINT_LOOKUP_FAILURE,
    };
  }

  if (!point) {
    return { kind: 'error', message: POINT_MISSING };
  }

  const result = await completeVisit(visitRepository, {
    pointId: point.id,
    installationCode: point.installationCode,
    meterNumber: point.meterNumber,
    previousReading: point.previousReading,
    currentReading: context.currentReading,
    photoUri,
    latitude: location.latitude,
    longitude: location.longitude,
    capturedAt: location.capturedAt,
  });

  return result.kind === 'completed'
    ? { kind: 'saved' }
    : { kind: 'error', message: result.message };
}

export function resetCompletionState(): VisitCompletionState {
  return { kind: 'idle' };
}
