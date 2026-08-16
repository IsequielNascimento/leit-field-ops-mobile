export type CurrentReadingValidationResult =
  | { kind: 'valid'; value: number }
  | { kind: 'required' }
  | { kind: 'invalid' };

/**
 * Validates the minimum reading requirements defined by the challenge.
 * Range, digit-count, and consumption rules intentionally belong to no
 * current requirement and are therefore not applied here.
 */
export function validateCurrentReading(input: string): CurrentReadingValidationResult {
  const value = input.trim();

  if (value.length === 0) {
    return { kind: 'required' };
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return { kind: 'invalid' };
  }

  return { kind: 'valid', value: parsedValue };
}
