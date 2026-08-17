import assert from 'node:assert/strict';
import test from 'node:test';

import type { RouteRepository } from '@/features/routes/domain/repositories/RouteRepository';
import type { Visit } from '../../domain/entities/Visit';
import type { VisitRepository } from '../../domain/repositories/VisitRepository';
import type {
  CameraPermissionGateway,
  CameraPermissionOutcome,
  DurablePhotoStorage,
} from '../../domain/services/CameraEvidenceService';
import type { VisitPhotoProcessor } from '../../domain/services/ImageProcessingService';
import type {
  CurrentPositionProvider,
  LocationFixOutcome,
  LocationPermissionGateway,
  LocationPermissionOutcome,
  LocationReading,
} from '../../domain/services/LocationEvidenceService';
import {
  handleCameraOutcome,
  parseVisitEvidenceContext,
  requestCamera,
  requestVisitLocation,
  resetCompletionState,
  resetEvidenceState,
  resetLocationState,
  submitCompletedVisit,
} from './VisitEvidenceViewModel';

function permissionGateway(result: CameraPermissionOutcome): CameraPermissionGateway {
  return { async requestPermission() { return result; } };
}

const durableStorage: DurablePhotoStorage = {
  async preserveCapture() {
    return 'file:///documents/visit-evidence/photo.jpg';
  },
};

const photoProcessor: VisitPhotoProcessor = {
  async compressForEvidence() {
    return 'file:///cache/compressed.jpg';
  },
};

test('parses valid visit evidence route context', () => {
  assert.deepEqual(parseVisitEvidenceContext('7', '18.5'), {
    pointId: 7,
    currentReading: 18.5,
  });
  assert.equal(parseVisitEvidenceContext(['7'], '18.5'), null);
  assert.equal(parseVisitEvidenceContext('0', '18.5'), null);
  assert.equal(parseVisitEvidenceContext('7', 'not-a-reading'), null);
});

test('maps camera permission results to presentation states', async () => {
  assert.deepEqual(await requestCamera(permissionGateway({ kind: 'granted' })), { kind: 'camera' });
  assert.deepEqual(
    await requestCamera(permissionGateway({ kind: 'denied', canAskAgain: false })),
    { kind: 'denied', canAskAgain: false },
  );
  assert.deepEqual(
    await requestCamera(permissionGateway({ kind: 'failed', message: 'Camera unavailable.' })),
    { kind: 'error', message: 'Camera unavailable.' },
  );
});

test('maps capture, cancellation, and failure outcomes to visible states', async () => {
  assert.deepEqual(
    await handleCameraOutcome(photoProcessor, durableStorage, {
      kind: 'captured',
      temporaryUri: 'file:///cache/photo.jpg',
    }),
    { kind: 'captured', photoUri: 'file:///documents/visit-evidence/photo.jpg' },
  );
  assert.deepEqual(await handleCameraOutcome(photoProcessor, durableStorage, { kind: 'cancelled' }), {
    kind: 'ready',
    notice: 'Photo capture cancelled.',
  });
  assert.deepEqual(
    await handleCameraOutcome(photoProcessor, durableStorage, {
      kind: 'failed',
      message: 'The camera could not capture a photo.',
    }),
    { kind: 'error', message: 'The camera could not capture a photo.' },
  );
});

test('retry resets camera evidence feedback', () => {
  assert.deepEqual(resetEvidenceState(), { kind: 'ready' });
});

const locationReading: LocationReading = {
  capturedAt: '2026-08-16T01:20:30.000Z',
  latitude: -3.7327,
  longitude: -38.5267,
};

function locationPermissionGateway(result: LocationPermissionOutcome): LocationPermissionGateway {
  return { async requestPermission() { return result; } };
}

function positionProvider(result: LocationFixOutcome): CurrentPositionProvider {
  return { async readCurrentPosition() { return result; } };
}

test('maps a granted location fix to a captured presentation state', async () => {
  assert.deepEqual(
    await requestVisitLocation(
      locationPermissionGateway({ kind: 'granted' }),
      positionProvider({ kind: 'fixed', reading: locationReading }),
    ),
    { kind: 'captured', reading: locationReading },
  );
});

test('maps location denial and unavailability to visible states without throwing', async () => {
  assert.deepEqual(
    await requestVisitLocation(
      locationPermissionGateway({ kind: 'denied', canAskAgain: true }),
      positionProvider({ kind: 'fixed', reading: locationReading }),
    ),
    { kind: 'denied', canAskAgain: true },
  );

  assert.deepEqual(
    await requestVisitLocation(
      locationPermissionGateway({ kind: 'denied', canAskAgain: false }),
      positionProvider({ kind: 'fixed', reading: locationReading }),
    ),
    { kind: 'denied', canAskAgain: false },
  );

  assert.deepEqual(
    await requestVisitLocation(
      locationPermissionGateway({ kind: 'granted' }),
      positionProvider({ kind: 'unavailable', message: 'Location services are turned off on this device.' }),
    ),
    { kind: 'error', message: 'Location services are turned off on this device.' },
  );

  assert.deepEqual(
    await requestVisitLocation(
      locationPermissionGateway({ kind: 'granted' }),
      positionProvider({ kind: 'failed', message: 'The device could not provide the current location.' }),
    ),
    { kind: 'error', message: 'The device could not provide the current location.' },
  );
});

test('retry resets location evidence feedback', () => {
  assert.deepEqual(resetLocationState(), { kind: 'idle' });
});

test('completes a visit from persisted point data and captured evidence', async () => {
  const saved: Visit[] = [];
  const routeRepository: RouteRepository = {
    getPointById: async () => ({
      id: 4,
      routeId: 'LEIT-ALDEOTA-001',
      order: 4,
      installationCode: 'LOCAL-INSTALLATION',
      customer: 'Local customer',
      referencePoint: 'Local reference',
      address: 'Local address',
      latitude: -3.7,
      longitude: -38.5,
      meterNumber: 'LOCAL-METER',
      previousReading: 318,
      status: 'pending',
    }),
    getRouteById: async () => null,
    saveRoute: async () => undefined,
  };
  const visitRepository: VisitRepository = {
    saveVisit: async (visit) => {
      saved.push(visit);
    },
    getVisitById: async () => null,
    getVisitsByPointId: async () => [],
    getVisitsBySyncStatus: async () => [],
    updateSyncStatus: async () => undefined,
  };

  const result = await submitCompletedVisit(
    routeRepository,
    visitRepository,
    { pointId: 4, currentReading: 341 },
    'file:///documents/visit-evidence/photo.jpg',
    locationReading,
  );

  assert.deepEqual(result, { kind: 'saved' });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], {
    id: saved[0].id,
    pointId: 4,
    installationCode: 'LOCAL-INSTALLATION',
    meterNumber: 'LOCAL-METER',
    previousReading: 318,
    currentReading: 341,
    photoUri: 'file:///documents/visit-evidence/photo.jpg',
    latitude: -3.7327,
    longitude: -38.5267,
    capturedAt: '2026-08-16T01:20:30.000Z',
    syncStatus: 'pending',
  });
});

test('does not save when the point is missing from local storage', async () => {
  let saveCount = 0;
  const result = await submitCompletedVisit(
    {
      getPointById: async () => null,
      getRouteById: async () => null,
      saveRoute: async () => undefined,
    },
    {
      saveVisit: async () => {
        saveCount += 1;
      },
      getVisitById: async () => null,
      getVisitsByPointId: async () => [],
      getVisitsBySyncStatus: async () => [],
      updateSyncStatus: async () => undefined,
    },
    { pointId: 4, currentReading: 341 },
    'file:///documents/visit-evidence/photo.jpg',
    locationReading,
  );

  assert.deepEqual(result, {
    kind: 'error',
    message: 'This point is no longer available in local storage.',
  });
  assert.equal(saveCount, 0);
});

test('retry resets visit-completion feedback', () => {
  assert.deepEqual(resetCompletionState(), { kind: 'idle' });
});
