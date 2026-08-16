import assert from 'node:assert/strict';
import test from 'node:test';

import type { DurablePhotoStorage } from '../services/CameraEvidenceService';
import { prepareVisitPhoto } from './PrepareVisitPhoto';

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

test('returns the durable URI after a captured photo is preserved', async () => {
  const result = await prepareVisitPhoto(storageWith('file:///documents/visit-evidence/photo.jpg'), {
    kind: 'captured',
    temporaryUri: 'file:///cache/photo.jpg',
  });

  assert.deepEqual(result, {
    kind: 'captured',
    photoUri: 'file:///documents/visit-evidence/photo.jpg',
  });
});

test('preserves cancelled, denied, and camera-failed outcomes without storage access', async () => {
  const storage: DurablePhotoStorage = {
    async preserveCapture() {
      assert.fail('storage must not run without a captured photo');
    },
  };

  assert.deepEqual(await prepareVisitPhoto(storage, { kind: 'cancelled' }), { kind: 'cancelled' });
  assert.deepEqual(
    await prepareVisitPhoto(storage, { kind: 'denied', canAskAgain: false }),
    { kind: 'denied', canAskAgain: false },
  );
  assert.deepEqual(
    await prepareVisitPhoto(storage, { kind: 'failed', message: 'Camera unavailable.' }),
    { kind: 'failed', message: 'Camera unavailable.' },
  );
});

test('does not report capture when durable storage fails', async () => {
  const result = await prepareVisitPhoto(storageWith(new Error('disk full')), {
    kind: 'captured',
    temporaryUri: 'file:///cache/photo.jpg',
  });

  assert.deepEqual(result, {
    kind: 'failed',
    message: 'The captured photo could not be stored on this device.',
  });
});

test('rejects a blank camera URI before writing storage', async () => {
  const result = await prepareVisitPhoto(storageWith('file:///documents/unused.jpg'), {
    kind: 'captured',
    temporaryUri: '   ',
  });

  assert.deepEqual(result, {
    kind: 'failed',
    message: 'The camera did not provide a photo file.',
  });
});
