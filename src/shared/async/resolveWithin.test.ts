import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWithin } from './resolveWithin';

function resolvesAfter<T>(value: T, milliseconds: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), milliseconds);
  });
}

test('returns the value when the operation finishes inside the budget', async () => {
  assert.equal(await resolveWithin(resolvesAfter('fix', 5), 200), 'fix');
});

test('returns null when the operation outlives the budget', async () => {
  assert.equal(await resolveWithin(resolvesAfter('fix', 200), 20), null);
});

test('a rejection still propagates instead of being read as a timeout', async () => {
  await assert.rejects(
    () => resolveWithin(Promise.reject(new Error('location unavailable')), 200),
    /location unavailable/,
  );
});

test('the timer is cleared so a resolved race does not keep the process alive', async () => {
  const before = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  await resolveWithin(Promise.resolve('fix'), 60_000);
  const after = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

  assert.equal(after, before);
});
