import type {
  CameraCaptureOutcome,
  DurablePhotoStorage,
  VisitPhotoEvidenceResult,
} from '../services/CameraEvidenceService';

/**
 * Converts a camera outcome into visit evidence. A temporary camera URI is
 * never reported as captured evidence until durable local storage succeeds.
 */
export async function prepareVisitPhoto(
  storage: DurablePhotoStorage,
  outcome: CameraCaptureOutcome,
): Promise<VisitPhotoEvidenceResult> {
  if (outcome.kind !== 'captured') {
    return outcome;
  }

  if (!outcome.temporaryUri.trim()) {
    return { kind: 'failed', message: 'The camera did not provide a photo file.' };
  }

  try {
    const photoUri = await storage.preserveCapture(outcome.temporaryUri);

    if (!photoUri.trim()) {
      return { kind: 'failed', message: 'The captured photo could not be stored on this device.' };
    }

    return { kind: 'captured', photoUri };
  } catch {
    return { kind: 'failed', message: 'The captured photo could not be stored on this device.' };
  }
}
