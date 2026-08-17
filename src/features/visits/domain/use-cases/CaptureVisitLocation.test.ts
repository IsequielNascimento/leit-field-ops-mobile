import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CurrentPositionProvider,
  LocationFixOutcome,
  LocationPermissionGateway,
  LocationPermissionOutcome,
  LocationReading,
} from '../services/LocationEvidenceService';
import { captureVisitLocation } from './CaptureVisitLocation';

const reading: LocationReading = {
  capturedAt: '2026-08-16T01:20:30.000Z',
  latitude: -3.7327,
  longitude: -38.5267,
};

function permissionGateway(result: LocationPermissionOutcome): LocationPermissionGateway {
  return { async requestPermission() { return result; } };
}

function positionProvider(result: LocationFixOutcome): CurrentPositionProvider {
  return { async readCurrentPosition() { return result; } };
}

const grantedPermission = permissionGateway({ kind: 'granted' });

const failingPositionProvider: CurrentPositionProvider = {
  async readCurrentPosition(): Promise<LocationFixOutcome> {
    throw new Error('platform module exploded');
  },
};

test('captures latitude, longitude, and capture time from a granted fix', async () => {
  assert.deepEqual(
    await captureVisitLocation(grantedPermission, positionProvider({ kind: 'fixed', reading })),
    { kind: 'captured', reading },
  );
});

test('never reads a position when permission was denied', async () => {
  let positionWasRead = false;
  const spy: CurrentPositionProvider = {
    async readCurrentPosition(): Promise<LocationFixOutcome> {
      positionWasRead = true;
      return { kind: 'fixed', reading };
    },
  };

  assert.deepEqual(
    await captureVisitLocation(permissionGateway({ kind: 'denied', canAskAgain: true }), spy),
    { kind: 'denied', canAskAgain: true },
  );
  assert.deepEqual(
    await captureVisitLocation(permissionGateway({ kind: 'denied', canAskAgain: false }), spy),
    { kind: 'denied', canAskAgain: false },
  );
  assert.equal(positionWasRead, false);
});

test('reports permission and position failures without throwing', async () => {
  assert.deepEqual(
    await captureVisitLocation(
      permissionGateway({ kind: 'failed', message: 'Permission check failed.' }),
      positionProvider({ kind: 'fixed', reading }),
    ),
    { kind: 'failed', message: 'Permission check failed.' },
  );

  assert.deepEqual(
    await captureVisitLocation(
      grantedPermission,
      positionProvider({
        kind: 'unavailable',
        message: 'Location services are turned off.',
        reason: 'services-disabled',
      }),
    ),
    {
      kind: 'unavailable',
      message: 'Location services are turned off.',
      reason: 'services-disabled',
    },
  );

  assert.deepEqual(
    await captureVisitLocation(
      { async requestPermission(): Promise<LocationPermissionOutcome> { throw new Error('boom'); } },
      positionProvider({ kind: 'fixed', reading }),
    ),
    { kind: 'failed', message: 'Location permission could not be checked.' },
  );

  assert.deepEqual(await captureVisitLocation(grantedPermission, failingPositionProvider), {
    kind: 'failed',
    message: 'The device could not provide the current location.',
  });
});

test('rejects unusable coordinates instead of reporting them as evidence', async () => {
  const unusable: LocationReading[] = [
    { ...reading, latitude: Number.NaN },
    { ...reading, longitude: Number.POSITIVE_INFINITY },
    { ...reading, latitude: 91 },
    { ...reading, longitude: -181 },
    { ...reading, capturedAt: '' },
    { ...reading, capturedAt: 'not-a-timestamp' },
  ];

  for (const candidate of unusable) {
    assert.deepEqual(
      await captureVisitLocation(grantedPermission, positionProvider({ kind: 'fixed', reading: candidate })),
      { kind: 'failed', message: 'The device returned an unusable location reading.' },
      `expected ${JSON.stringify(candidate)} to be rejected`,
    );
  }
});

test('accepts boundary coordinates the device can legitimately report', async () => {
  const boundary: LocationReading = { ...reading, latitude: -90, longitude: 180 };

  assert.deepEqual(
    await captureVisitLocation(grantedPermission, positionProvider({ kind: 'fixed', reading: boundary })),
    { kind: 'captured', reading: boundary },
  );
});
