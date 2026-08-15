import type { Visit, VisitSyncStatus } from '../entities/Visit';

/**
 * Persistence boundary for visit records. Implementations own storage
 * details; callers depend only on this contract. This is storage capability
 * only — it does not implement the complete-visit use case or the
 * synchronization state machine.
 */
export interface VisitRepository {
  /** Persists a new visit record atomically. */
  saveVisit(visit: Visit): Promise<void>;

  /** Retrieves a visit by its stable identifier, or `null` if not found. */
  getVisitById(visitId: string): Promise<Visit | null>;

  /** Retrieves all visits recorded for a given route point. */
  getVisitsByPointId(pointId: number): Promise<Visit[]>;

  /** Retrieves all visits currently in the given synchronization status. */
  getVisitsBySyncStatus(syncStatus: VisitSyncStatus): Promise<Visit[]>;

  /** Updates the synchronization status of an existing visit. */
  updateSyncStatus(visitId: string, syncStatus: VisitSyncStatus): Promise<void>;
}
