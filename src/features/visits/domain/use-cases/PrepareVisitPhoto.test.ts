import assert from 'node:assert/strict';
import test from 'node:test';

import type { DurablePhotoStorage } from '../services/CameraEvidenceService';
import type { VisitPhotoProcessor } from '../services/ImageProcessingService';
import { VISIT_PHOTO_IMAGE_POLICY } from '../services/ImageProcessingService';
import { prepareVisitPhoto } from './PrepareVisitPhoto';

function processorWith(result: string | Error): VisitPhotoProcessor {
  return {
    async compressForEvidence() {
      if (result instanceof Error) {
        throw result;
      }

      return result;
    },
  };
}

const compressedProcessor = processorWith('file:///cache/compressed.jpg');

function storageWith(result: string | Error): DurablePhotoStorage {
  return {
    async preserveCapture() {
      if (result instanceof Error) {
        throw result;
      }

      return result;
    },
  };
}

function recordingStorage(preservedUris: string[]): DurablePhotoStorage {
  return {
    async preserveCapture(temporaryUri: string) {
      preservedUris.push(temporaryUri);
      return 'file:///documents/visit-evidence/photo.jpg';
    },
  };
}

test('returns the durable URI after a captured photo is preserved', async () => {
  const result = await prepareVisitPhoto(
    compressedProcessor,
    storageWith('file:///documents/visit-evidence/photo.jpg'),
    { kind: 'captured', temporaryUri: 'file:///cache/photo.jpg' },
  );

  assert.deepEqual(result, {
    kind: 'captured',
    photoUri: 'file:///documents/visit-evidence/photo.jpg',
  });
});

test('stores the compressed image instead of the raw camera capture', async () => {
  const preservedUris: string[] = [];

  await prepareVisitPhoto(compressedProcessor, recordingStorage(preservedUris), {
    kind: 'captured',
    temporaryUri: 'file:///cache/photo.jpg',
  });

  assert.deepEqual(preservedUris, ['file:///cache/compressed.jpg']);
});

test('applies the documented resize and compression policy', async () => {
  const appliedPolicies: unknown[] = [];
  const processor: VisitPhotoProcessor = {
    async compressForEvidence(_temporaryUri, policy) {
      appliedPolicies.push(policy);
      return 'file:///cache/compressed.jpg';
    },
  };

  await prepareVisitPhoto(processor, storageWith('file:///documents/visit-evidence/photo.jpg'), {
    kind: 'captured',
    temporaryUri: 'file:///cache/photo.jpg',
  });

  assert.deepEqual(appliedPolicies, [VISIT_PHOTO_IMAGE_POLICY]);
});

test('falls back to the original capture when compression fails', async () => {
  const preservedUris: string[] = [];

  const result = await prepareVisitPhoto(
    processorWith(new Error('image decoding failed')),
    recordingStorage(preservedUris),
    { kind: 'captured', temporaryUri: 'file:///cache/photo.jpg' },
  );

  assert.deepEqual(preservedUris, ['file:///cache/photo.jpg']);
  assert.deepEqual(result, {
    kind: 'captured',
    photoUri: 'file:///documents/visit-evidence/photo.jpg',
  });
});

test('falls back to the original capture when compression returns a blank URI', async () => {
  const preservedUris: string[] = [];

  const result = await prepareVisitPhoto(processorWith('   '), recordingStorage(preservedUris), {
    kind: 'captured',
    temporaryUri: 'file:///cache/photo.jpg',
  });

  assert.deepEqual(preservedUris, ['file:///cache/photo.jpg']);
  assert.equal(result.kind, 'captured');
});

test('preserves cancelled, denied, and camera-failed outcomes without storage access', async () => {
  const processor: VisitPhotoProcessor = {
    async compressForEvidence() {
      assert.fail('compression must not run without a captured photo');
    },
  };
  const storage: DurablePhotoStorage = {
    async preserveCapture() {
      assert.fail('storage must not run without a captured photo');
    },
  };

  assert.deepEqual(await prepareVisitPhoto(processor, storage, { kind: 'cancelled' }), {
    kind: 'cancelled',
  });
  assert.deepEqual(
    await prepareVisitPhoto(processor, storage, { kind: 'denied', canAskAgain: false }),
    { kind: 'denied', canAskAgain: false },
  );
  assert.deepEqual(
    await prepareVisitPhoto(processor, storage, { kind: 'failed', message: 'Camera unavailable.' }),
    { kind: 'failed', message: 'Camera unavailable.' },
  );
});

test('does not report capture when durable storage fails', async () => {
  const result = await prepareVisitPhoto(compressedProcessor, storageWith(new Error('disk full')), {
    kind: 'captured',
    temporaryUri: 'file:///cache/photo.jpg',
  });

  assert.deepEqual(result, {
    kind: 'failed',
    message: 'The captured photo could not be stored on this device.',
  });
});

test('rejects a blank camera URI before compressing or writing storage', async () => {
  const processor: VisitPhotoProcessor = {
    async compressForEvidence() {
      assert.fail('compression must not run without a photo file');
    },
  };

  const result = await prepareVisitPhoto(processor, storageWith('file:///documents/unused.jpg'), {
    kind: 'captured',
    temporaryUri: '   ',
  });

  assert.deepEqual(result, {
    kind: 'failed',
    message: 'The camera did not provide a photo file.',
  });
});
