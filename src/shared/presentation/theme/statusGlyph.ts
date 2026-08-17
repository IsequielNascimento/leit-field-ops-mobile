import type { StatusTone } from './tokens';

/**
 * Status must stay readable for a field agent in direct sunlight and for a
 * colour-blind reader, so every tone also carries a distinct glyph. The badge
 * therefore signals state through shape and wording, never through colour alone.
 */
const TONE_GLYPHS: Record<StatusTone, string> = {
  neutral: '•',
  info: 'i',
  success: '✓',
  warning: '!',
  danger: '×',
};

export function statusToneGlyph(tone: StatusTone): string {
  return TONE_GLYPHS[tone];
}
