import type { Visit } from '../../domain/entities/Visit';
import type { VisitSyncGateway, VisitSyncOutcome } from '../../domain/services/VisitSyncService';

export const SIMULATED_SEND_DELAY_MS = 700;

export const SIMULATED_UNREACHABLE_MESSAGE = 'The visit could not be delivered from this device.';

export type DelayFunction = (milliseconds: number) => Promise<void>;

export type ServiceReachabilityProbe = () => boolean;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

interface SimulatedVisitSyncGatewayOptions {
  canReachService?: ServiceReachabilityProbe;
  delay?: DelayFunction;
  delayMs?: number;
}

/**
 * The stand-in for a real submission API. It performs no network access; the
 * delay exists only so the `syncing` state is observable in the interface.
 *
 * `canReachService` is the injected precondition that decides whether the
 * simulated send is accepted or refused. It defaults to always reachable, and
 * exists so the refusal path — and therefore the persisted `error` state — is
 * deterministic and reproducible rather than random.
 *
 * This class is the single replaceable seam: swapping it for an HTTP client
 * that implements `VisitSyncGateway` requires no change to the use case,
 * view-model or screens.
 */
export class SimulatedVisitSyncGateway implements VisitSyncGateway {
  private readonly canReachService: ServiceReachabilityProbe;

  private readonly delay: DelayFunction;

  private readonly delayMs: number;

  constructor(options: SimulatedVisitSyncGatewayOptions = {}) {
    this.canReachService = options.canReachService ?? (() => true);
    this.delay = options.delay ?? wait;
    this.delayMs = options.delayMs ?? SIMULATED_SEND_DELAY_MS;
  }

  async sendVisit(_visit: Visit): Promise<VisitSyncOutcome> {
    await this.delay(this.delayMs);

    if (!this.canReachService()) {
      return { kind: 'rejected', message: SIMULATED_UNREACHABLE_MESSAGE };
    }

    return { kind: 'accepted' };
  }
}
