import type {
  CameraCaptureOutcome,
  CameraPermissionGateway,
  DurablePhotoStorage,
} from '../../domain/services/CameraEvidenceService';
import { prepareVisitPhoto } from '../../domain/use-cases/PrepareVisitPhoto';
import { validateCurrentReading } from '../../domain/validation/validateCurrentReading';

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
  storage: DurablePhotoStorage,
  outcome: CameraCaptureOutcome,
): Promise<VisitEvidenceState> {
  const result = await prepareVisitPhoto(storage, outcome);

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
