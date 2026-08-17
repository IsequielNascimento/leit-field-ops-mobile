import assert from 'node:assert/strict';
import test from 'node:test';

import { describeBackgroundSyncOutcome } from './BackgroundVisitSync';

test('a finished run is reported as success even when records were refused', () => {
  assert.equal(
    describeBackgroundSyncOutcome({
      kind: 'finished',
      summary: { attempted: 2, synced: 1, failed: 1 },
    }),
    'success',
  );
});

test('a run skipped by the single-flight guard is not an operating system failure', () => {
  assert.equal(
    describeBackgroundSyncOutcome({ kind: 'skipped', reason: 'already-running' }),
    'success',
  );
});

test('only a local storage failure is reported as failed', () => {
  assert.equal(
    describeBackgroundSyncOutcome({ kind: 'failed', message: 'disk full' }),
    'failed',
  );
});
