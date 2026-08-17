import type {
  CameraCaptureOutcome,
  DurablePhotoStorage,
  VisitPhotoEvidenceResult,
} from '../services/CameraEvidenceService';
import type { VisitPhotoProcessor } from '../services/ImageProcessingService';
import { VISIT_PHOTO_IMAGE_POLICY } from '../services/ImageProcessingService';

/**
 * Converts a camera outcome into visit evidence. The capture is resized and
 * compressed before it is stored, and a temporary URI is never reported as
 * captured evidence until durable local storage succeeds.
 */
export async function prepareVisitPhoto(
  processor: VisitPhotoProcessor,
  storage: DurablePhotoStorage,
  outcome: CameraCaptureOutcome,
): Promise<VisitPhotoEvidenceResult> {
  if (outcome.kind !== 'captured') {
    return outcome;
  }

  if (!outcome.temporaryUri.trim()) {
    return { kind: 'failed', message: 'The camera did not provide a photo file.' };
  }

  const storableUri = await compressOrKeepOriginal(processor, outcome.temporaryUri);

  try {
    const photoUri = await storage.preserveCapture(storableUri);

    if (!photoUri.trim()) {
      return { kind: 'failed', message: 'The captured photo could not be stored on this device.' };
    }

    return { kind: 'captured', photoUri };
  } catch {
    return { kind: 'failed', message: 'The captured photo could not be stored on this device.' };
  }
}

/**
 * A failed or empty compression must never cost the technician the visit. The
 * untouched capture is stored instead, so the visit still ends up referencing a
 * durable file rather than aborting the completion flow.
 */
async function compressOrKeepOriginal(
  processor: VisitPhotoProcessor,
  temporaryUri: string,
): Promise<string> {
  try {
    const compressedUri = await processor.compressForEvidence(temporaryUri, VISIT_PHOTO_IMAGE_POLICY);
    return compressedUri.trim() ? compressedUri : temporaryUri;
  } catch {
    return temporaryUri;
  }
}
