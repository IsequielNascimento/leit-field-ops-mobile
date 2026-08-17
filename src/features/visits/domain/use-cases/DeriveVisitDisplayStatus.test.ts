import assert from 'node:assert/strict';
import test from 'node:test';

import type { Visit } from '../entities/Visit';
import { deriveVisitDisplayStatus, selectLatestVisit } from './DeriveVisitDisplayStatus';

const visit: Visit = {
  id: 'visit-1',
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
};

test('keeps the official point status while no visit has been recorded', () => {
  assert.deepEqual(deriveVisitDisplayStatus('pending', null), {
    label: 'pending',
    tone: 'warning',
  });
  assert.deepEqual(deriveVisitDisplayStatus('completed', null), {
    label: 'completed',
    tone: 'success',
  });
  assert.deepEqual(deriveVisitDisplayStatus('unknown-status', null), {
    label: 'unknown-status',
    tone: 'neutral',
  });
});

test('shows a recorded visit as awaiting synchronization', () => {
  assert.deepEqual(deriveVisitDisplayStatus('pending', visit), {
    label: 'Visited · pending sync',
    tone: 'warning',
  });
});

test('maps every persisted synchronization status to distinct text and tone', () => {
  assert.deepEqual(deriveVisitDisplayStatus('pending', { ...visit, syncStatus: 'syncing' }), {
    label: 'Visited · syncing',
    tone: 'neutral',
  });
  assert.deepEqual(deriveVisitDisplayStatus('pending', { ...visit, syncStatus: 'synced' }), {
    label: 'Visited · synced',
    tone: 'success',
  });
});

test('selects the most recently captured visit for a point', () => {
  const older: Visit = { ...visit, id: 'visit-0', capturedAt: '2026-08-15T09:00:00.000Z' };
  const newer: Visit = { ...visit, id: 'visit-2', capturedAt: '2026-08-16T10:00:00.000Z' };

  assert.equal(selectLatestVisit([]), null);
  assert.equal(selectLatestVisit([older, visit, newer])?.id, 'visit-2');
  assert.equal(selectLatestVisit([newer, visit, older])?.id, 'visit-2');
});
