import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VISIT_PHOTO_IMAGE_POLICY,
  resolveEvidenceDownscale,
} from './ImageProcessingService';

test('keeps the documented evidence policy explicit', () => {
  assert.deepEqual(VISIT_PHOTO_IMAGE_POLICY, {
    maxLongestEdgePixels: 1600,
    jpegQuality: 0.7,
  });
});

test('constrains the longest edge of an oversized capture', () => {
  assert.deepEqual(resolveEvidenceDownscale(4000, 3000, VISIT_PHOTO_IMAGE_POLICY), { width: 1600 });
  assert.deepEqual(resolveEvidenceDownscale(3000, 4000, VISIT_PHOTO_IMAGE_POLICY), { height: 1600 });
  assert.deepEqual(resolveEvidenceDownscale(2400, 2400, VISIT_PHOTO_IMAGE_POLICY), { width: 1600 });
});

test('never upscales a capture that already respects the policy', () => {
  assert.equal(resolveEvidenceDownscale(1600, 1200, VISIT_PHOTO_IMAGE_POLICY), null);
  assert.equal(resolveEvidenceDownscale(800, 600, VISIT_PHOTO_IMAGE_POLICY), null);
});

test('skips resizing when the reported dimensions are unusable', () => {
  assert.equal(resolveEvidenceDownscale(0, 3000, VISIT_PHOTO_IMAGE_POLICY), null);
  assert.equal(resolveEvidenceDownscale(-4000, 3000, VISIT_PHOTO_IMAGE_POLICY), null);
  assert.equal(resolveEvidenceDownscale(Number.NaN, 3000, VISIT_PHOTO_IMAGE_POLICY), null);
});
