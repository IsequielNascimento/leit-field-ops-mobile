import type { Visit } from '../entities/Visit';
import type { VisitRepository } from '../repositories/VisitRepository';

const SAVE_FAILURE = 'The visit could not be saved on this device.';

/**
 * Everything a completed visit needs, gathered from the point being served
 * and the evidence captured during the visit.
 */
export interface CompleteVisitInput {
  pointId: number;
  installationCode: string;
  meterNumber: string;
  previousReading: number;
  currentReading: number;
  photoUri: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
}

export type CompleteVisitResult =
  | { kind: 'completed'; visit: Visit }
  | { kind: 'failed'; message: string };

export type VisitIdFactory = () => string;

/**
 * Assembles the record for a finished visit. A visit always starts at
 * `pending`; the synchronization states beyond it are owned by a later task.
 */
export function buildPendingVisit(input: CompleteVisitInput, visitId: string): Visit {
  return {
    id: visitId,
    pointId: input.pointId,
    installationCode: input.installationCode,
    meterNumber: input.meterNumber,
    previousReading: input.previousReading,
    currentReading: input.currentReading,
    photoUri: input.photoUri,
    latitude: input.latitude,
    longitude: input.longitude,
    capturedAt: input.capturedAt,
    syncStatus: 'pending',
  };
}

function createVisitId(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return `visit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Completes a visit against local storage only. The record is written by a
 * single repository call, so a failure leaves no partially written visit
 * behind, and nothing here reaches the network.
 */
export async function completeVisit(
  repository: VisitRepository,
  input: CompleteVisitInput,
  newVisitId: VisitIdFactory = createVisitId,
): Promise<CompleteVisitResult> {
  const visit = buildPendingVisit(input, newVisitId());

  try {
    await repository.saveVisit(visit);
  } catch (error) {
    return { kind: 'failed', message: error instanceof Error ? error.message : SAVE_FAILURE };
  }

  return { kind: 'completed', visit };
}
