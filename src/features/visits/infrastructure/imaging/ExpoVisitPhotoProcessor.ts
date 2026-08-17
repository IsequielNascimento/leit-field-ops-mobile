import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type {
  VisitPhotoImagePolicy,
  VisitPhotoProcessor,
} from '../../domain/services/ImageProcessingService';
import { resolveEvidenceDownscale } from '../../domain/services/ImageProcessingService';

export class ExpoVisitPhotoProcessor implements VisitPhotoProcessor {
  async compressForEvidence(
    temporaryUri: string,
    policy: VisitPhotoImagePolicy,
  ): Promise<string> {
    const source = await ImageManipulator.manipulate(temporaryUri).renderAsync();
    const downscale = resolveEvidenceDownscale(source.width, source.height, policy);

    if (!downscale) {
      const saved = await source.saveAsync({
        compress: policy.jpegQuality,
        format: SaveFormat.JPEG,
      });

      return saved.uri;
    }

    const resized = await ImageManipulator.manipulate(temporaryUri).resize(downscale).renderAsync();
    const saved = await resized.saveAsync({
      compress: policy.jpegQuality,
      format: SaveFormat.JPEG,
    });

    return saved.uri;
  }
}
