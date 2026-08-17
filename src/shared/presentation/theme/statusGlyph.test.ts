import assert from 'node:assert/strict';
import test from 'node:test';

import { statusToneGlyph } from './statusGlyph';
import { tokens } from './tokens';
import type { StatusTone } from './tokens';

const TONES = Object.keys(tokens.colors.status) as StatusTone[];

test('every status tone carries a glyph', () => {
  for (const tone of TONES) {
    assert.ok(statusToneGlyph(tone).trim().length > 0, `tone ${tone} has no glyph`);
  }
});

test('tones are distinguishable without colour', () => {
  const glyphs = TONES.map(statusToneGlyph);
  assert.equal(new Set(glyphs).size, glyphs.length);
});
