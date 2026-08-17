import assert from 'node:assert/strict';
import test from 'node:test';

import { SQLiteRouteRepository } from '@/features/routes/data/repositories/SQLiteRouteRepository';
import { seedOfficialRoute } from '@/features/routes/data/seed/seedOfficialRoute';
import { loadPointDetails } from '@/features/routes/presentation/view-models/PointDetailsViewModel';
import { loadRouteHome } from '@/features/routes/presentation/view-models/RouteHomeViewModel';
import { runMigrations } from '@/shared/data/database/migrations';
import { createInMemoryTestDatabase } from '@/shared/data/database/testing/inMemoryTestDatabase';
import { SQLiteVisitRepository } from '../data/repositories/SQLiteVisitRepository';
import type { Visit, VisitSyncStatus } from '../domain/entities/Visit';
import type {
  CameraPermissionGateway,
  DurablePhotoStorage,
} from '../domain/services/CameraEvidenceService';
import type { VisitPhotoProcessor } from '../domain/services/ImageProcessingService';
import type {
  CurrentPositionProvider,
  LocationPermissionGateway,
} from '../domain/services/LocationEvidenceService';
import { deriveVisitDisplayStatus } from '../domain/use-cases/DeriveVisitDisplayStatus';
import { VisitSyncRunner } from '../domain/use-cases/VisitSyncRunner';
import { validateCurrentReading } from '../domain/validation/validateCurrentReading';
import { SimulatedVisitSyncGateway } from '../infrastructure/sync/SimulatedVisitSyncGateway';
import {
  handleCameraOutcome,
  parseVisitEvidenceContext,
  requestCamera,
  requestVisitLocation,
  submitCompletedVisit,
} from './view-models/VisitEvidenceViewModel';
import {
  describeVisitSyncState,
  eligibleForSyncCount,
  loadVisitSyncSummary,
  runVisitSync,
} from './view-models/VisitSyncViewModel';

const FIRST_POINT_ID = 101;

// MARK: device boundaries — the only doubles in this flow
const grantedCamera: CameraPermissionGateway & DurablePhotoStorage = {
  async requestPermission() {
    return { kind: 'granted' };
  },
  async preserveCapture(temporaryUri: string) {
    return temporaryUri.replace('file:///cache/', 'file:///documents/visit-evidence/');
  },
};

const photoProcessor: VisitPhotoProcessor = {
  async compressForEvidence(temporaryUri: string) {
    return temporaryUri;
  },
};

const grantedLocation: LocationPermissionGateway & CurrentPositionProvider = {
  async requestPermission() {
    return { kind: 'granted' };
  },
  async readCurrentPosition() {
    return {
      kind: 'fixed',
      reading: {
        latitude: -3.7327,
        longitude: -38.4969,
        capturedAt: '2026-03-01T12:00:00.000Z',
      },
    };
  },
};

async function offlineDevice() {
  const database = createInMemoryTestDatabase();
  await runMigrations(database.db);
  await seedOfficialRoute(database.db);

  return {
    close: database.close,
    db: database.db,
    routeRepository: new SQLiteRouteRepository(database.db),
    visitRepository: new SQLiteVisitRepository(database.db),
  };
}

/** Walks the screens' own view-model calls for one point, exactly as the UI does. */
async function completeVisitThroughTheUi(
  device: Awaited<ReturnType<typeof offlineDevice>>,
  pointId: number,
  typedReading: string,
) {
  const details = await loadPointDetails(device.routeRepository, device.visitRepository, String(pointId));
  assert.equal(details.kind, 'loaded');

  const reading = validateCurrentReading(typedReading);
  assert.equal(reading.kind, 'valid');

  const context = parseVisitEvidenceContext(String(pointId), typedReading);
  assert.ok(context);

  assert.deepEqual(await requestCamera(grantedCamera), { kind: 'camera' });

  const photoState = await handleCameraOutcome(photoProcessor, grantedCamera, {
    kind: 'captured',
    temporaryUri: `file:///cache/point-${pointId}.jpg`,
  });
  assert.equal(photoState.kind, 'captured');

  const locationState = await requestVisitLocation(grantedLocation, grantedLocation);
  assert.equal(locationState.kind, 'captured');

  const completion = await submitCompletedVisit(
    device.routeRepository,
    device.visitRepository,
    context,
    photoState.photoUri,
    locationState.reading,
  );
  assert.deepEqual(completion, { kind: 'saved' });

  return { photoUri: photoState.photoUri, reading: locationState.reading };
}

test('the offline visit flow reaches pending and survives a restart', async () => {
  const device = await offlineDevice();

  try {
    const home = await loadRouteHome(device.routeRepository, device.visitRepository);
    assert.equal(home.kind, 'loaded');
    assert.equal(home.route.points.length, 7);
    assert.equal(home.latestVisits.size, 0);

    const { photoUri, reading } = await completeVisitThroughTheUi(device, FIRST_POINT_ID, '184.5');

    // MARK: a restart is a fresh read of the same durable database
    const afterRestart = await loadRouteHome(
      new SQLiteRouteRepository(device.db),
      new SQLiteVisitRepository(device.db),
    );
    assert.equal(afterRestart.kind, 'loaded');

    const visit = afterRestart.latestVisits.get(FIRST_POINT_ID);
    assert.ok(visit);
    assert.equal(visit.syncStatus, 'pending');
    assert.equal(visit.currentReading, 184.5);
    assert.equal(visit.photoUri, photoUri);
    assert.equal(visit.latitude, reading.latitude);
    assert.equal(visit.longitude, reading.longitude);
    assert.equal(visit.capturedAt, reading.capturedAt);

    const point = afterRestart.route.points.find((candidate) => candidate.id === FIRST_POINT_ID);
    assert.ok(point);
    assert.deepEqual(deriveVisitDisplayStatus(point.status, visit), {
      label: 'Visited · pending sync',
      tone: 'warning',
    });
  } finally {
    device.close();
  }
});

test('an invalid reading never reaches the evidence screen', async () => {
  const device = await offlineDevice();

  try {
    assert.equal(validateCurrentReading('').kind, 'required');
    assert.equal(validateCurrentReading('abc').kind, 'invalid');
    assert.equal(parseVisitEvidenceContext(String(FIRST_POINT_ID), 'abc'), null);
    assert.equal(parseVisitEvidenceContext(String(FIRST_POINT_ID), ''), null);

    const visits = await device.visitRepository.getVisitsByPointId(FIRST_POINT_ID);
    assert.deepEqual(visits, []);
  } finally {
    device.close();
  }
});

test('synchronizing a pending visit walks pending, syncing and synced in the interface', async () => {
  const device = await offlineDevice();

  try {
    await completeVisitThroughTheUi(device, FIRST_POINT_ID, '184.5');

    const pendingSummary = await loadVisitSyncSummary(device.visitRepository);
    assert.equal(pendingSummary.pending, 1);
    assert.equal(eligibleForSyncCount(pendingSummary), 1);
    assert.equal(
      describeVisitSyncState({ kind: 'idle' }, pendingSummary),
      '1 visit waiting to be sent.',
    );

    const observed: VisitSyncStatus[] = [];
    const runner = new VisitSyncRunner(
      device.visitRepository,
      new SimulatedVisitSyncGateway({ delayMs: 0 }),
    );

    const state = await runVisitSync(runner, (visit: Visit) => observed.push(visit.syncStatus));

    assert.deepEqual(observed, ['syncing', 'synced']);
    assert.deepEqual(state, { kind: 'completed', synced: 1, failed: 0 });
    assert.equal(describeVisitSyncState(state!, pendingSummary), '1 visit synchronized.');

    const syncedSummary = await loadVisitSyncSummary(new SQLiteVisitRepository(device.db));
    assert.deepEqual(syncedSummary, { error: 0, pending: 0, syncing: 0, synced: 1 });
    assert.equal(eligibleForSyncCount(syncedSummary), 0);
  } finally {
    device.close();
  }
});

test('a refused send settles in error, keeps the evidence, and a retry reaches synced', async () => {
  const device = await offlineDevice();

  try {
    await completeVisitThroughTheUi(device, FIRST_POINT_ID, '184.5');

    let serviceReachable = false;
    const gateway = new SimulatedVisitSyncGateway({
      canReachService: () => serviceReachable,
      delayMs: 0,
    });
    const runner = new VisitSyncRunner(device.visitRepository, gateway);

    const failedState = await runVisitSync(runner);
    assert.deepEqual(failedState, { kind: 'completed', synced: 0, failed: 1 });

    const afterFailure = await new SQLiteVisitRepository(device.db).getVisitsByPointId(FIRST_POINT_ID);
    assert.equal(afterFailure.length, 1);
    assert.equal(afterFailure[0].syncStatus, 'error');
    assert.equal(afterFailure[0].currentReading, 184.5);
    assert.ok(afterFailure[0].photoUri.startsWith('file:///documents/visit-evidence/'));

    const failedSummary = await loadVisitSyncSummary(device.visitRepository);
    assert.equal(eligibleForSyncCount(failedSummary), 1);

    serviceReachable = true;
    const retryState = await runVisitSync(runner);
    assert.deepEqual(retryState, { kind: 'completed', synced: 1, failed: 0 });

    const afterRetry = await new SQLiteVisitRepository(device.db).getVisitsByPointId(FIRST_POINT_ID);
    assert.equal(afterRetry[0].syncStatus, 'synced');
  } finally {
    device.close();
  }
});

test('a second sync trigger during a run does not start a duplicate pass', async () => {
  const device = await offlineDevice();

  try {
    await completeVisitThroughTheUi(device, FIRST_POINT_ID, '184.5');
    await completeVisitThroughTheUi(device, 102, '221');

    let sends = 0;
    const runner = new VisitSyncRunner(device.visitRepository, {
      async sendVisit() {
        sends += 1;
        return { kind: 'accepted' };
      },
    });

    const [first, second] = await Promise.all([runVisitSync(runner), runVisitSync(runner)]);

    assert.deepEqual(first, { kind: 'completed', synced: 2, failed: 0 });
    assert.equal(second, null);
    assert.equal(sends, 2);
  } finally {
    device.close();
  }
});
