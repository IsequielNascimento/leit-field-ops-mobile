import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCurrentReading } from './validateCurrentReading';

test('rejects an empty current reading as required', () => {
  assert.deepEqual(validateCurrentReading('   '), { kind: 'required' });
});

test('rejects a non-numeric or non-finite current reading', () => {
  assert.deepEqual(validateCurrentReading('not-a-reading'), { kind: 'invalid' });
  assert.deepEqual(validateCurrentReading('Infinity'), { kind: 'invalid' });
});

test('accepts a valid numeric current reading without a minimum digit count', () => {
  assert.deepEqual(validateCurrentReading('7'), { kind: 'valid', value: 7 });
  assert.deepEqual(validateCurrentReading('  18.5 '), { kind: 'valid', value: 18.5 });
});
