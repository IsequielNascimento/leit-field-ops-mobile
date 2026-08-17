import type { Visit } from '../../domain/entities/Visit';
import type { VisitSyncGateway, VisitSyncOutcome } from '../../domain/services/VisitSyncService';

export const SIMULATED_SEND_DELAY_MS = 700;

export type DelayFunction = (milliseconds: number) => Promise<void>;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * The stand-in for a real submission API. It performs no network access; the
 * delay exists only so the `syncing` state is observable in the interface.
 *
 * This class is the single replaceable seam: swapping it for an HTTP client
 * that implements `VisitSyncGateway` requires no change to the use case,
 * view-model or screens.
 */
export class SimulatedVisitSyncGateway implements VisitSyncGateway {
  constructor(
    private readonly delayMs: number = SIMULATED_SEND_DELAY_MS,
    private readonly delay: DelayFunction = wait,
  ) {}

  async sendVisit(_visit: Visit): Promise<VisitSyncOutcome> {
    await this.delay(this.delayMs);

    return { kind: 'accepted' };
  }
}
