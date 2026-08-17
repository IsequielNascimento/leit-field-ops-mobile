export interface VisitPhotoImagePolicy {
  maxLongestEdgePixels: number;
  jpegQuality: number;
}

export type EvidenceDownscale = { width: number } | { height: number } | null;

/**
 * Evidence photos are read by a human reviewer and, later, by OCR. 1600 px on
 * the longest edge keeps a meter register several pixels per digit stroke after
 * a 12 MP capture, and quality 0.7 stays above the level where JPEG blocking
 * starts closing thin digits, while cutting a route's worth of offline photos
 * from megabytes to a few hundred kilobytes each.
 */
export const VISIT_PHOTO_IMAGE_POLICY: VisitPhotoImagePolicy = {
  maxLongestEdgePixels: 1600,
  jpegQuality: 0.7,
};

/**
 * Resolves the single dimension to constrain so the image keeps its aspect
 * ratio. Returns `null` when the capture is already within the policy or when
 * the reported dimensions are unusable, so an image is never upscaled.
 */
export function resolveEvidenceDownscale(
  width: number,
  height: number,
  policy: VisitPhotoImagePolicy,
): EvidenceDownscale {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const longestEdge = Math.max(width, height);

  if (longestEdge <= policy.maxLongestEdgePixels) {
    return null;
  }

  return width >= height
    ? { width: policy.maxLongestEdgePixels }
    : { height: policy.maxLongestEdgePixels };
}

export interface VisitPhotoProcessor {
  compressForEvidence(temporaryUri: string, policy: VisitPhotoImagePolicy): Promise<string>;
}
