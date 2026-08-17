import assert from 'node:assert/strict';
import test from 'node:test';

import { describeConnectivityBanner } from './ConnectivityBannerViewModel';

test('describeConnectivityBanner hides the banner when online', () => {
  const view = describeConnectivityBanner('online');

  assert.equal(view.visible, false);
});

test('describeConnectivityBanner shows a danger-toned banner when offline', () => {
  const view = describeConnectivityBanner('offline');

  assert.equal(view.visible, true);
  assert.equal(view.tone, 'danger');
  assert.match(view.label, /offline/i);
});

test('describeConnectivityBanner is pure and returns equivalent output for repeated calls', () => {
  const first = describeConnectivityBanner('offline');
  const second = describeConnectivityBanner('offline');

  assert.deepEqual(first, second);
});
