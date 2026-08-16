import { Camera } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';

import type {
  CameraPermissionGateway,
  CameraPermissionOutcome,
  DurablePhotoStorage,
} from '../../domain/services/CameraEvidenceService';

const EVIDENCE_DIRECTORY = 'visit-evidence';

function createPhotoName(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `visit-${Date.now()}-${randomPart}.jpg`;
}

export class ExpoCameraEvidenceService
  implements CameraPermissionGateway, DurablePhotoStorage
{
  async requestPermission(): Promise<CameraPermissionOutcome> {
    try {
      const current = await Camera.getCameraPermissionsAsync();

      if (current.granted) {
        return { kind: 'granted' };
      }

      if (!current.canAskAgain) {
        return { kind: 'denied', canAskAgain: false };
      }

      const requested = await Camera.requestCameraPermissionsAsync();
      return requested.granted
        ? { kind: 'granted' }
        : { kind: 'denied', canAskAgain: requested.canAskAgain };
    } catch {
      return { kind: 'failed', message: 'Camera permission could not be checked.' };
    }
  }

  async preserveCapture(temporaryUri: string): Promise<string> {
    const evidenceDirectory = new Directory(Paths.document, EVIDENCE_DIRECTORY);
    evidenceDirectory.create({ idempotent: true, intermediates: true });

    const source = new File(temporaryUri);
    const destination = new File(evidenceDirectory, createPhotoName());
    await source.copy(destination);

    if (!destination.exists) {
      throw new Error('Durable photo copy was not created.');
    }

    return destination.uri;
  }
}
